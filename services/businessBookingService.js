// services/businessBookingService.js
const db = require('../models');
const { BusinessAccount, BusinessBooking, Booking, User, Trip, Route, Stop } = db;
const { Op } = require('sequelize');
const ReceiptService = require('./receiptService');
const SeatManagementService = require('./seatManagementService');

class BusinessBookingService {

    // Create business account
    static async createBusinessAccount(businessData) {
        const transaction = await db.sequelize.transaction();

        try {
            const {
                user_id, // Admin user for this business
                business_name,
                business_registration_number,
                tax_id,
                contact_person,
                business_email,
                business_phone,
                address
            } = businessData;

            // Check if business registration number already exists
            const existingBusiness = await BusinessAccount.findOne({
                where: { business_registration_number }
            });

            if (existingBusiness) {
                throw new Error('Business with this registration number already exists');
            }

            // Check if user exists and is not already associated with a business
            const user = await User.findByPk(user_id);
            if (!user) {
                throw new Error('User not found');
            }

            const existingUserBusiness = await BusinessAccount.findOne({
                where: { user_id }
            });

            if (existingUserBusiness) {
                throw new Error('User is already associated with a business account');
            }

            // Create business account
            const businessAccount = await BusinessAccount.create({
                user_id,
                business_name,
                business_registration_number,
                tax_id,
                contact_person,
                business_email,
                business_phone,
                address,
                status: 'pending_approval'
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                message: 'Business account created successfully. Awaiting approval.',
                business_account: {
                    business_id: businessAccount.business_id,
                    business_name: businessAccount.business_name,
                    registration_number: businessAccount.business_registration_number,
                    status: businessAccount.status,
                    created_at: businessAccount.created_at
                }
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error creating business account:', error);
            throw error;
        }
    }

    // Create booking for employee
    static async createEmployeeBooking(businessBookingData) {
        const transaction = await db.sequelize.transaction();

        try {
            const {
                business_id,
                trip_id,
                pickup_stop_id,
                dropoff_stop_id,
                employee_name,
                employee_id,
                department,
                passenger_count = 1,
                seat_preferences = [],
                approved_by, // User ID of the approver
                auto_approve = false
            } = businessBookingData;

            // Verify business account
            const business = await BusinessAccount.findByPk(business_id);
            if (!business) {
                throw new Error('Business account not found');
            }

            if (business.status !== 'active') {
                throw new Error('Business account is not active');
            }

            // Verify trip
            const trip = await Trip.findByPk(trip_id, {
                include: [
                    {
                        model: Route,
                        as: 'route',
                        attributes: ['route_name']
                    },
                    {
                        model: db.Vehicle,
                        as: 'vehicle',
                        attributes: ['seat_capacity']
                    }
                ]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            // Check seat availability
            const availableSeats = await SeatManagementService.getAvailableSeats(
                trip_id,
                pickup_stop_id,
                dropoff_stop_id
            );

            if (availableSeats.available_seats < passenger_count) {
                throw new Error('Not enough seats available');
            }

            // Calculate fare (businesses might have different rates)
            const fare = await this.calculateBusinessFare(business_id, trip_id, pickup_stop_id, dropoff_stop_id, passenger_count);

            // Create regular booking
            const booking = await Booking.create({
                user_id: business.user_id, // Use business admin as the booking user
                trip_id,
                pickup_stop_id,
                dropoff_stop_id,
                booking_time: new Date(),
                fare_amount: fare.total_fare,
                passenger_count,
                status: auto_approve ? 'confirmed' : 'pending',
                payment_status: 'pending',
                booking_type: 'business'
            }, { transaction });

            // Create business booking record
            const businessBooking = await BusinessBooking.create({
                business_id,
                booking_id: booking.booking_id,
                employee_name,
                employee_id,
                department,
                approved_by: auto_approve ? approved_by : null,
                approval_status: auto_approve ? 'approved' : 'pending'
            }, { transaction });

            // Reserve seats if approved
            let seatNumbers = [];
            if (auto_approve) {
                if (seat_preferences.length > 0) {
                    try {
                        await SeatManagementService.reserveSeats(
                            booking.booking_id,
                            trip_id,
                            seat_preferences
                        );
                        seatNumbers = seat_preferences;
                    } catch (seatError) {
                        // Auto-assign if preferred seats not available
                        seatNumbers = await this.autoAssignSeats(trip_id, passenger_count, booking.booking_id);
                    }
                } else {
                    seatNumbers = await this.autoAssignSeats(trip_id, passenger_count, booking.booking_id);
                }

                // Update booking with seat numbers
                await booking.update({
                    seat_numbers: seatNumbers.join(',')
                }, { transaction });
            }

            await transaction.commit();

            return {
                success: true,
                message: auto_approve ? 'Employee booking created and approved' : 'Employee booking created, awaiting approval',
                booking: {
                    booking_id: booking.booking_id,
                    business_booking_id: businessBooking.business_booking_id,
                    employee_name,
                    employee_id,
                    trip_info: {
                        route_name: trip.route.route_name,
                        departure_time: trip.start_time
                    },
                    seat_numbers: seatNumbers,
                    fare_amount: fare.total_fare,
                    status: booking.status,
                    approval_status: businessBooking.approval_status
                }
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error creating employee booking:', error);
            throw error;
        }
    }

    // Approve/reject employee booking
    static async approveEmployeeBooking(businessBookingId, approverId, decision, notes = '') {
        const transaction = await db.sequelize.transaction();

        try {
            const businessBooking = await BusinessBooking.findByPk(businessBookingId, {
                include: [
                    {
                        model: BusinessAccount,
                        as: 'business'
                    },
                    {
                        model: Booking,
                        as: 'booking',
                        include: [
                            {
                                model: Trip,
                                as: 'trip'
                            }
                        ]
                    }
                ]
            });

            if (!businessBooking) {
                throw new Error('Business booking not found');
            }

            // Verify approver has permission
            if (businessBooking.business.user_id !== approverId) {
                throw new Error('Only business admin can approve bookings');
            }

            if (businessBooking.approval_status !== 'pending') {
                throw new Error('Booking has already been processed');
            }

            if (decision === 'approved') {
                // Check if seats are still available
                const availableSeats = await SeatManagementService.getAvailableSeats(
                    businessBooking.booking.trip_id,
                    businessBooking.booking.pickup_stop_id,
                    businessBooking.booking.dropoff_stop_id
                );

                if (availableSeats.available_seats < businessBooking.booking.passenger_count) {
                    throw new Error('Seats are no longer available for this trip');
                }

                // Auto-assign seats
                const seatNumbers = await this.autoAssignSeats(
                    businessBooking.booking.trip_id,
                    businessBooking.booking.passenger_count,
                    businessBooking.booking.booking_id
                );

                // Update booking
                await businessBooking.booking.update({
                    status: 'confirmed',
                    seat_numbers: seatNumbers.join(',')
                }, { transaction });

                // Update business booking
                await businessBooking.update({
                    approval_status: 'approved',
                    approved_by: approverId
                }, { transaction });

                await transaction.commit();

                // Generate receipt
                const receipt = await ReceiptService.generateBookingReceipt(businessBooking.booking.booking_id);

                return {
                    success: true,
                    message: 'Employee booking approved successfully',
                    booking_id: businessBooking.booking.booking_id,
                    seat_numbers: seatNumbers,
                    receipt: receipt.receipt
                };

            } else if (decision === 'rejected') {
                // Update booking status
                await businessBooking.booking.update({
                    status: 'cancelled'
                }, { transaction });

                await businessBooking.update({
                    approval_status: 'rejected',
                    approved_by: approverId
                }, { transaction });

                await transaction.commit();

                return {
                    success: true,
                    message: 'Employee booking rejected',
                    booking_id: businessBooking.booking.booking_id
                };

            } else {
                throw new Error('Invalid decision. Must be "approved" or "rejected"');
            }

        } catch (error) {
            await transaction.rollback();
            console.error('Error approving employee booking:', error);
            throw error;
        }
    }

    // Get business bookings
    static async getBusinessBookings(businessId, filters = {}) {
        try {
            const {
                start_date,
                end_date,
                approval_status,
                department,
                employee_id,
                page = 1,
                limit = 20
            } = filters;

            const whereCondition = { business_id: businessId };

            // Apply filters
            if (approval_status) {
                whereCondition.approval_status = approval_status;
            }
            if (department) {
                whereCondition.department = department;
            }
            if (employee_id) {
                whereCondition.employee_id = employee_id;
            }

            const offset = (page - 1) * limit;

            const businessBookings = await BusinessBooking.findAndCountAll({
                where: whereCondition,
                include: [
                    {
                        model: Booking,
                        as: 'booking',
                        include: [
                            {
                                model: Trip,
                                as: 'trip',
                                include: [
                                    {
                                        model: Route,
                                        as: 'route',
                                        attributes: ['route_name']
                                    }
                                ]
                            },
                            {
                                model: Stop,
                                as: 'pickup_stop',
                                attributes: ['stop_name']
                            },
                            {
                                model: Stop,
                                as: 'dropoff_stop',
                                attributes: ['stop_name']
                            }
                        ],
                        where: start_date || end_date ? {
                            booking_time: {
                                ...(start_date && { [Op.gte]: start_date }),
                                ...(end_date && { [Op.lte]: end_date })
                            }
                        } : undefined
                    },
                    {
                        model: User,
                        as: 'approver',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['created_at', 'DESC']],
                limit,
                offset
            });

            const bookings = businessBookings.rows.map(bb => ({
                business_booking_id: bb.business_booking_id,
                booking_id: bb.booking.booking_id,
                employee_name: bb.employee_name,
                employee_id: bb.employee_id,
                department: bb.department,
                trip_info: {
                    route_name: bb.booking.trip.route.route_name,
                    pickup_stop: bb.booking.pickup_stop.stop_name,
                    dropoff_stop: bb.booking.dropoff_stop.stop_name,
                    departure_time: bb.booking.trip.start_time
                },
                booking_time: bb.booking.booking_time,
                fare_amount: bb.booking.fare_amount,
                passenger_count: bb.booking.passenger_count,
                seat_numbers: bb.booking.seat_numbers,
                booking_status: bb.booking.status,
                payment_status: bb.booking.payment_status,
                approval_status: bb.approval_status,
                approved_by: bb.approver ? `${bb.approver.first_name} ${bb.approver.last_name}` : null,
                created_at: bb.created_at
            }));

            return {
                bookings,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(businessBookings.count / limit),
                    total_items: businessBookings.count,
                    items_per_page: limit
                }
            };

        } catch (error) {
            console.error('Error getting business bookings:', error);
            throw error;
        }
    }

    // Get business account details
    static async getBusinessAccount(businessId, userId) {
        try {
            const business = await BusinessAccount.findOne({
                where: {
                    business_id: businessId,
                    user_id: userId
                },
                include: [
                    {
                        model: User,
                        as: 'admin',
                        attributes: ['first_name', 'last_name', 'email', 'phone']
                    }
                ]
            });

            if (!business) {
                throw new Error('Business account not found or access denied');
            }

            // Get booking statistics
            const bookingStats = await BusinessBooking.findAll({
                where: { business_id: businessId },
                include: [
                    {
                        model: Booking,
                        as: 'booking',
                        attributes: ['fare_amount', 'status']
                    }
                ],
                attributes: [
                    'approval_status',
                    [db.sequelize.fn('COUNT', db.sequelize.col('business_booking_id')), 'count'],
                    [db.sequelize.fn('SUM', db.sequelize.col('booking.fare_amount')), 'total_amount']
                ],
                group: ['approval_status'],
                raw: true
            });

            const stats = {
                total_bookings: 0,
                total_amount: 0,
                by_status: {}
            };

            bookingStats.forEach(stat => {
                const count = parseInt(stat.count);
                const amount = parseFloat(stat['booking.fare_amount'] || 0);

                stats.total_bookings += count;
                stats.total_amount += amount;
                stats.by_status[stat.approval_status] = { count, amount };
            });

            return {
                business_info: {
                    business_id: business.business_id,
                    business_name: business.business_name,
                    registration_number: business.business_registration_number,
                    tax_id: business.tax_id,
                    contact_person: business.contact_person,
                    business_email: business.business_email,
                    business_phone: business.business_phone,
                    address: business.address,
                    status: business.status,
                    created_at: business.created_at
                },
                admin_info: {
                    name: `${business.admin.first_name} ${business.admin.last_name}`,
                    email: business.admin.email,
                    phone: business.admin.phone
                },
                booking_statistics: stats
            };

        } catch (error) {
            console.error('Error getting business account:', error);
            throw error;
        }
    }

    // Update business account
    static async updateBusinessAccount(businessId, userId, updateData) {
        try {
            const business = await BusinessAccount.findOne({
                where: {
                    business_id: businessId,
                    user_id: userId
                }
            });

            if (!business) {
                throw new Error('Business account not found or access denied');
            }

            const allowedFields = [
                'business_name', 'contact_person', 'business_email',
                'business_phone', 'address', 'tax_id'
            ];

            const updateFields = {};
            for (const [key, value] of Object.entries(updateData)) {
                if (allowedFields.includes(key)) {
                    updateFields[key] = value;
                }
            }

            await business.update(updateFields);

            return {
                success: true,
                message: 'Business account updated successfully',
                updated_fields: Object.keys(updateFields)
            };

        } catch (error) {
            console.error('Error updating business account:', error);
            throw error;
        }
    }

    // Calculate business fare (might have discounts)
    static async calculateBusinessFare(businessId, tripId, pickupStopId, dropoffStopId, passengerCount) {
        try {
            // Get regular fare
            const fare = await db.Fare.findOne({
                where: {
                    from_stop_id: pickupStopId,
                    to_stop_id: dropoffStopId
                }
            });

            let baseFare = 2000; // Default fare
            if (fare) {
                baseFare = fare.fare_amount;
            }

            // Apply business discount (if any)
            const business = await BusinessAccount.findByPk(businessId);
            let discount = 0;

            // You can implement business-specific discounts here
            // For example: volume discounts, corporate rates, etc.
            if (business && business.status === 'active') {
                // Example: 10% discount for active businesses
                discount = 0.1;
            }

            const discountedFare = baseFare * (1 - discount);
            const totalFare = discountedFare * passengerCount;

            return {
                base_fare: baseFare,
                discount_percentage: discount * 100,
                discounted_fare: discountedFare,
                total_fare: totalFare,
                per_passenger: discountedFare,
                savings: (baseFare - discountedFare) * passengerCount
            };

        } catch (error) {
            console.error('Error calculating business fare:', error);
            throw error;
        }
    }

    // Auto-assign seats helper
    static async autoAssignSeats(tripId, passengerCount, bookingId) {
        try {
            const availableSeats = await SeatManagementService.getAvailableSeats(tripId, null, null);

            if (availableSeats.available_seats < passengerCount) {
                throw new Error('Not enough seats available');
            }

            const seatsToAssign = availableSeats.seats
                .filter(seat => seat.is_available)
                .slice(0, passengerCount)
                .map(seat => seat.seat_number);

            await SeatManagementService.reserveSeats(bookingId, tripId, seatsToAssign);

            return seatsToAssign;

        } catch (error) {
            console.error('Error auto-assigning seats:', error);
            throw error;
        }
    }

    // Get pending approvals for business admin
    static async getPendingApprovals(businessId, userId) {
        try {
            // Verify user is business admin
            const business = await BusinessAccount.findOne({
                where: {
                    business_id: businessId,
                    user_id: userId
                }
            });

            if (!business) {
                throw new Error('Access denied: Not a business admin');
            }

            const pendingBookings = await BusinessBooking.findAll({
                where: {
                    business_id: businessId,
                    approval_status: 'pending'
                },
                include: [
                    {
                        model: Booking,
                        as: 'booking',
                        include: [
                            {
                                model: Trip,
                                as: 'trip',
                                include: [
                                    {
                                        model: Route,
                                        as: 'route',
                                        attributes: ['route_name']
                                    }
                                ]
                            },
                            {
                                model: Stop,
                                as: 'pickup_stop',
                                attributes: ['stop_name']
                            },
                            {
                                model: Stop,
                                as: 'dropoff_stop',
                                attributes: ['stop_name']
                            }
                        ]
                    }
                ],
                order: [['created_at', 'ASC']]
            });

            return pendingBookings.map(bb => ({
                business_booking_id: bb.business_booking_id,
                booking_id: bb.booking.booking_id,
                employee_name: bb.employee_name,
                employee_id: bb.employee_id,
                department: bb.department,
                trip_details: {
                    route_name: bb.booking.trip.route.route_name,
                    pickup_stop: bb.booking.pickup_stop.stop_name,
                    dropoff_stop: bb.booking.dropoff_stop.stop_name,
                    departure_time: bb.booking.trip.start_time
                },
                passenger_count: bb.booking.passenger_count,
                fare_amount: bb.booking.fare_amount,
                requested_at: bb.created_at,
                urgency: this.calculateUrgency(bb.booking.trip.start_time)
            }));

        } catch (error) {
            console.error('Error getting pending approvals:', error);
            throw error;
        }
    }

    // Calculate urgency of approval based on trip time
    static calculateUrgency(tripStartTime) {
        const now = new Date();
        const tripTime = new Date(tripStartTime);
        const hoursUntilTrip = (tripTime - now) / (1000 * 60 * 60);

        if (hoursUntilTrip < 2) {
            return 'urgent';
        } else if (hoursUntilTrip < 24) {
            return 'high';
        } else if (hoursUntilTrip < 72) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    // Bulk approve multiple bookings
    static async bulkApproveBookings(businessId, userId, bookingIds, decision) {
        const transaction = await db.sequelize.transaction();

        try {
            // Verify user is business admin
            const business = await BusinessAccount.findOne({
                where: {
                    business_id: businessId,
                    user_id: userId
                }
            });

            if (!business) {
                throw new Error('Access denied: Not a business admin');
            }

            const results = [];

            for (const bookingId of bookingIds) {
                try {
                    const result = await this.approveEmployeeBooking(bookingId, userId, decision);
                    results.push({
                        business_booking_id: bookingId,
                        success: true,
                        ...result
                    });
                } catch (error) {
                    results.push({
                        business_booking_id: bookingId,
                        success: false,
                        error: error.message
                    });
                }
            }

            await transaction.commit();

            const successCount = results.filter(r => r.success).length;
            const failureCount = results.filter(r => !r.success).length;

            return {
                success: true,
                message: `Processed ${bookingIds.length} bookings: ${successCount} successful, ${failureCount} failed`,
                results: results,
                summary: {
                    total: bookingIds.length,
                    successful: successCount,
                    failed: failureCount
                }
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error bulk approving bookings:', error);
            throw error;
        }
    }

    // Generate business booking report
    static async generateBusinessReport(businessId, userId, reportParams) {
        try {
            const {
                start_date,
                end_date,
                report_type = 'summary', // 'summary', 'detailed', 'by_employee', 'by_department'
                department,
                employee_id
            } = reportParams;

            // Verify user is business admin
            const business = await BusinessAccount.findOne({
                where: {
                    business_id: businessId,
                    user_id: userId
                }
            });

            if (!business) {
                throw new Error('Access denied: Not a business admin');
            }

            const whereCondition = { business_id: businessId };
            const bookingWhereCondition = {};

            if (department) whereCondition.department = department;
            if (employee_id) whereCondition.employee_id = employee_id;
            if (start_date || end_date) {
                bookingWhereCondition.booking_time = {
                    ...(start_date && { [Op.gte]: start_date }),
                    ...(end_date && { [Op.lte]: end_date })
                };
            }

            const businessBookings = await BusinessBooking.findAll({
                where: whereCondition,
                include: [
                    {
                        model: Booking,
                        as: 'booking',
                        where: Object.keys(bookingWhereCondition).length > 0 ? bookingWhereCondition : undefined,
                        include: [
                            {
                                model: Trip,
                                as: 'trip',
                                include: [
                                    {
                                        model: Route,
                                        as: 'route',
                                        attributes: ['route_name']
                                    }
                                ]
                            },
                            {
                                model: Stop,
                                as: 'pickup_stop',
                                attributes: ['stop_name']
                            },
                            {
                                model: Stop,
                                as: 'dropoff_stop',
                                attributes: ['stop_name']
                            }
                        ]
                    }
                ]
            });

            let reportData = {};

            switch (report_type) {
                case 'summary':
                    reportData = this.generateSummaryReport(businessBookings);
                    break;
                case 'detailed':
                    reportData = this.generateDetailedReport(businessBookings);
                    break;
                case 'by_employee':
                    reportData = this.generateEmployeeReport(businessBookings);
                    break;
                case 'by_department':
                    reportData = this.generateDepartmentReport(businessBookings);
                    break;
                default:
                    reportData = this.generateSummaryReport(businessBookings);
            }

            return {
                business_info: {
                    business_name: business.business_name,
                    registration_number: business.business_registration_number
                },
                report_params: {
                    start_date,
                    end_date,
                    report_type,
                    department,
                    employee_id
                },
                generated_at: new Date(),
                ...reportData
            };

        } catch (error) {
            console.error('Error generating business report:', error);
            throw error;
        }
    }

    // Helper methods for different report types
    static generateSummaryReport(bookings) {
        const summary = {
            total_bookings: bookings.length,
            total_amount: 0,
            by_status: {},
            by_approval_status: {},
            top_routes: {},
            top_employees: {}
        };

        bookings.forEach(bb => {
            const booking = bb.booking;

            // Total amount
            summary.total_amount += parseFloat(booking.fare_amount);

            // By booking status
            summary.by_status[booking.status] = (summary.by_status[booking.status] || 0) + 1;

            // By approval status
            summary.by_approval_status[bb.approval_status] = (summary.by_approval_status[bb.approval_status] || 0) + 1;

            // Top routes
            const routeName = booking.trip.route.route_name;
            summary.top_routes[routeName] = (summary.top_routes[routeName] || 0) + 1;

            // Top employees
            summary.top_employees[bb.employee_name] = (summary.top_employees[bb.employee_name] || 0) + 1;
        });

        return { summary };
    }

    static generateDetailedReport(bookings) {
        const detailed = bookings.map(bb => ({
            business_booking_id: bb.business_booking_id,
            booking_id: bb.booking.booking_id,
            employee_name: bb.employee_name,
            employee_id: bb.employee_id,
            department: bb.department,
            route_name: bb.booking.trip.route.route_name,
            pickup_stop: bb.booking.pickup_stop.stop_name,
            dropoff_stop: bb.booking.dropoff_stop.stop_name,
            departure_time: bb.booking.trip.start_time,
            booking_time: bb.booking.booking_time,
            fare_amount: bb.booking.fare_amount,
            passenger_count: bb.booking.passenger_count,
            booking_status: bb.booking.status,
            approval_status: bb.approval_status,
            created_at: bb.created_at
        }));

        return { detailed_bookings: detailed };
    }

    static generateEmployeeReport(bookings) {
        const employeeStats = {};

        bookings.forEach(bb => {
            const key = `${bb.employee_name} (${bb.employee_id})`;

            if (!employeeStats[key]) {
                employeeStats[key] = {
                    employee_name: bb.employee_name,
                    employee_id: bb.employee_id,
                    department: bb.department,
                    total_bookings: 0,
                    total_amount: 0,
                    approved_bookings: 0,
                    pending_bookings: 0,
                    rejected_bookings: 0
                };
            }

            const stats = employeeStats[key];
            stats.total_bookings += 1;
            stats.total_amount += parseFloat(bb.booking.fare_amount);

            switch (bb.approval_status) {
                case 'approved':
                    stats.approved_bookings += 1;
                    break;
                case 'pending':
                    stats.pending_bookings += 1;
                    break;
                case 'rejected':
                    stats.rejected_bookings += 1;
                    break;
            }
        });

        return { employee_statistics: Object.values(employeeStats) };
    }

    static generateDepartmentReport(bookings) {
        const departmentStats = {};

        bookings.forEach(bb => {
            const dept = bb.department || 'Unspecified';

            if (!departmentStats[dept]) {
                departmentStats[dept] = {
                    department: dept,
                    total_bookings: 0,
                    total_amount: 0,
                    unique_employees: new Set(),
                    approved_bookings: 0,
                    pending_bookings: 0,
                    rejected_bookings: 0
                };
            }

            const stats = departmentStats[dept];
            stats.total_bookings += 1;
            stats.total_amount += parseFloat(bb.booking.fare_amount);
            stats.unique_employees.add(bb.employee_id);

            switch (bb.approval_status) {
                case 'approved':
                    stats.approved_bookings += 1;
                    break;
                case 'pending':
                    stats.pending_bookings += 1;
                    break;
                case 'rejected':
                    stats.rejected_bookings += 1;
                    break;
            }
        });

        // Convert Set to count
        Object.values(departmentStats).forEach(stats => {
            stats.unique_employees = stats.unique_employees.size;
        });

        return { department_statistics: Object.values(departmentStats) };
    }

    // Set business account status (admin function)
    static async setBusinessAccountStatus(businessId, status, adminUserId) {
        try {
            const business = await BusinessAccount.findByPk(businessId);

            if (!business) {
                throw new Error('Business account not found');
            }

            const validStatuses = ['pending_approval', 'active', 'inactive', 'suspended'];
            if (!validStatuses.includes(status)) {
                throw new Error('Invalid status');
            }

            await business.update({ status });

            return {
                success: true,
                message: `Business account status updated to ${status}`,
                business_id: businessId,
                new_status: status
            };

        } catch (error) {
            console.error('Error setting business account status:', error);
            throw error;
        }
    }
}

module.exports = BusinessBookingService;