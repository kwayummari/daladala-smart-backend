const db = require('../models');
const Notification = db.Notification;

class NotificationService {
  /**
   * Create a new notification
   * @param {Object} notificationData - The notification data
   * @returns {Promise<Object>} - The created notification
   */
  static async createNotification(notificationData) {
    try {
      return await Notification.create(notificationData);
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Send booking confirmation notification
   * @param {number} userId - User ID
   * @param {Object} booking - Booking data
   * @returns {Promise<Object>} - The created notification
   */
  static async sendBookingConfirmation(userId, booking) {
    try {
      return await this.createNotification({
        user_id: userId,
        title: 'Booking Confirmation',
        message: `Your booking for trip #${booking.trip_id} has been confirmed. Please proceed with payment.`,
        type: 'success',
        related_entity: 'booking',
        related_id: booking.booking_id
      });
    } catch (error) {
      throw new Error(`Failed to send booking confirmation: ${error.message}`);
    }
  }

  /**
   * Send payment confirmation notification
   * @param {number} userId - User ID
   * @param {Object} payment - Payment data
   * @param {Object} booking - Booking data
   * @returns {Promise<Object>} - The created notification
   */
  static async sendPaymentConfirmation(userId, payment, booking) {
    try {
      return await this.createNotification({
        user_id: userId,
        title: 'Payment Confirmation',
        message: `Your payment of ${payment.amount} ${payment.currency} for booking #${booking.booking_id} has been confirmed.`,
        type: 'success',
        related_entity: 'payment',
        related_id: payment.payment_id
      });
    } catch (error) {
      throw new Error(`Failed to send payment confirmation: ${error.message}`);
    }
  }

  /**
   * Send trip start notification
   * @param {number} userId - User ID
   * @param {Object} trip - Trip data
   * @param {Object} booking - Booking data
   * @returns {Promise<Object>} - The created notification
   */
  static async sendTripStartNotification(userId, trip, booking) {
    try {
      const pickup = await db.Stop.findByPk(booking.pickup_stop_id);
      const dropoff = await db.Stop.findByPk(booking.dropoff_stop_id);

      return await this.createNotification({
        user_id: userId,
        title: 'Trip Started',
        message: `Your trip from ${pickup.stop_name} to ${dropoff.stop_name} has started.`,
        type: 'info',
        related_entity: 'trip',
        related_id: trip.trip_id
      });
    } catch (error) {
      throw new Error(`Failed to send trip start notification: ${error.message}`);
    }
  }

  /**
   * Send trip arrival notification
   * @param {number} userId - User ID
   * @param {Object} trip - Trip data
   * @param {Object} stop - Stop data
   * @returns {Promise<Object>} - The created notification
   */
  static async sendStopArrivalNotification(userId, trip, stop) {
    try {
      return await this.createNotification({
        user_id: userId,
        title: 'Approaching Stop',
        message: `Your vehicle is approaching ${stop.stop_name}.`,
        type: 'info',
        related_entity: 'trip',
        related_id: trip.trip_id
      });
    } catch (error) {
      throw new Error(`Failed to send stop arrival notification: ${error.message}`);
    }
  }

  /**
   * Send trip completion notification
   * @param {number} userId - User ID
   * @param {Object} trip - Trip data
   * @param {Object} booking - Booking data
   * @returns {Promise<Object>} - The created notification
   */
  static async sendTripCompletionNotification(userId, trip, booking) {
    try {
      return await this.createNotification({
        user_id: userId,
        title: 'Trip Completed',
        message: `Your trip has been completed. Thank you for using Daladala Smart!`,
        type: 'success',
        related_entity: 'trip',
        related_id: trip.trip_id
      });
    } catch (error) {
      throw new Error(`Failed to send trip completion notification: ${error.message}`);
    }
  }
}

module.exports = NotificationService;