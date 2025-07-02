# Daladala Smart - ZenoPay Payment Integration Setup

## 🚀 Quick Start Guide

### 1. Install Dependencies

```bash
cd daladala-smart-backend
npm install axios uuid nodemailer multer
```

### 2. Environment Configuration

Update your `.env` file with ZenoPay credentials:

```env
# ZenoPay Configuration
ZENOPAY_API_KEY=your_actual_zenopay_api_key_here
ZENOPAY_WEBHOOK_URL=https://yourdomain.com/api/payments/webhook/zenopay

# For local development
# ZENOPAY_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/payments/webhook/zenopay
```

### 3. Database Migration

Run the payment table migration:

```bash
# If using Sequelize CLI
npx sequelize-cli db:migrate

# Or create the table manually using the migration SQL
```

### 4. File Structure

Create these new files in your backend:

```
daladala-smart-backend/
├── services/
│   ├── zenoPayService.js          # ZenoPay API integration
│   └── notificationService.js     # Email/SMS notifications
├── controllers/
│   └── payment.controller.js      # Updated payment controller
├── routes/
│   └── payment.routes.js          # Updated payment routes
├── models/
│   └── payment.model.js           # Enhanced payment model
├── migrations/
│   └── YYYYMMDD-create-payments-table.js
└── tests/
    └── payment.test.js            # Integration tests
```

## 🔧 Implementation Steps

### Step 1: Add ZenoPay Service

Copy the `zenoPayService.js` file to `services/zenoPayService.js`

### Step 2: Update Payment Controller

Replace your existing `controllers/payment.controller.js` with the updated version

### Step 3: Update Payment Routes

Replace your existing `routes/payment.routes.js` with the updated version

### Step 4: Update Payment Model

Replace your existing `models/payment.model.js` with the enhanced version

### Step 5: Add Notification Service

Add the `notificationService.js` file to `services/notificationService.js`

### Step 6: Run Database Migration

Execute the payment table migration to update your database schema

## 🧪 Testing the Integration

### Option 1: Use the Test Script

```bash
# Set environment variables first
export ZENOPAY_API_KEY="your_test_api_key"

# Run the test script
node tests/payment.test.js
```

### Option 2: Manual API Testing

#### 1. Test Payment Initiation

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 1,
    "payment_method": "mobile_money",
    "phone_number": "0744963858"
  }'
```

#### 2. Test Payment Status Check

```bash
curl -X GET http://localhost:3000/api/payments/1/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Test Webhook (Simulate ZenoPay callback)

```bash
curl -X POST http://localhost:3000/api/payments/webhook/zenopay \
  -H "x-api-key: YOUR_ZENOPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "DLS_1_12345-uuid",
    "payment_status": "COMPLETED",
    "reference": "1003020496"
  }'
```

## 📱 Frontend Integration

### Mobile App (Flutter) Integration

For your Flutter app, update the payment provider to support mobile money:

```dart
// lib/features/payments/data/repositories/payment_repository.dart
Future<PaymentResult> processMobileMoneyPayment({
  required int bookingId,
  required String phoneNumber,
}) async {
  try {
    final response = await _apiClient.post('/payments', {
      'booking_id': bookingId,
      'payment_method': 'mobile_money',
      'phone_number': phoneNumber,
    });
    
    return PaymentResult.fromJson(response.data);
  } catch (e) {
    throw PaymentException(e.toString());
  }
}
```

### Web App (React) Integration

For your React web app, update the payment service:

```javascript
// src/services/paymentService.js
export const processMobileMoneyPayment = async (paymentData) => {
  try {
    const response = await api.post('/payments', {
      ...paymentData,
      payment_method: 'mobile_money'
    });
    
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Payment failed');
  }
};
```

## 🔒 Security Considerations

### 1. Webhook Security

- Always verify the `x-api-key` header in webhook requests
- Use HTTPS for webhook URLs in production
- Consider implementing additional signature verification

### 2. API Key Management

```bash
# Production environment variables
ZENOPAY_API_KEY=prod_your_actual_api_key
ZENOPAY_WEBHOOK_URL=https://yourdomain.com/api/payments/webhook/zenopay

# Development environment variables  
ZENOPAY_API_KEY=test_your_test_api_key
ZENOPAY_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/payments/webhook/zenopay
```

### 3. Rate Limiting

Add rate limiting to payment endpoints:

```javascript
const rateLimit = require('express-rate-limit');

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many payment requests, please try again later.'
});

router.use('/payments', paymentLimiter);
```

## 🚀 Deployment Checklist

### Before Going Live:

- [ ] Update ZenoPay API key to production key
- [ ] Set production webhook URL
- [ ] Configure SSL certificate for webhook endpoint
- [ ] Set up monitoring and logging
- [ ] Test with small amounts first
- [ ] Configure email/SMS notifications
- [ ] Set up database backups
- [ ] Configure error alerting

### Environment Variables for Production:

```env
NODE_ENV=production
ZENOPAY_API_KEY=prod_your_actual_zenopay_api_key
ZENOPAY_WEBHOOK_URL=https://api.daladalasmart.com/api/payments/webhook/zenopay
APP_URL=https://daladalasmart.com

# Database
DB_HOST=your_production_db_host
DB_NAME=daladala_smart_prod
DB_USER=your_db_user
DB_PASSWORD=your_secure_password

# Email
SMTP_HOST=smtp.gmail.com
SMTP_USER=noreply@daladalasmart.com
SMTP_PASS=your_app_password
```

## 🔍 Monitoring and Debugging

### 1. Log Payment Events

```javascript
// Add to your logging middleware
app.use((req, res, next) => {
  if (req.path.includes('/payments')) {
    console.log(`Payment API: ${req.method} ${req.path}`, {
      userId: req.userId,
      body: req.body,
      timestamp: new Date().toISOString()
    });
  }
  next();
});
```

### 2. Monitor Failed Payments

```sql
-- Query to monitor failed payments
SELECT 
  p.payment_id,
  p.booking_id,
  p.amount,
  p.status,
  p.failure_reason,
  p.created_at,
  u.email,
  u.phone_number
FROM payments p
JOIN users u ON p.user_id = u.user_id
WHERE p.status IN ('failed', 'expired', 'cancelled')
  AND p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY p.created_at DESC;
```

### 3. Payment Analytics

```sql
-- Revenue and transaction analytics
SELECT 
  DATE(payment_time) as payment_date,
  COUNT(*) as total_transactions,
  SUM(amount) as total_revenue,
  AVG(amount) as average_transaction,
  COUNT(CASE WHEN payment_method = 'mobile_money' THEN 1 END) as mobile_money_count
FROM payments 
WHERE status = 'completed' 
  AND payment_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(payment_time)
ORDER BY payment_date DESC;
```

## 🆘 Troubleshooting

### Common Issues:

1. **Webhook not receiving callbacks**
   - Check if webhook URL is accessible from internet
   - Verify x-api-key header in webhook endpoint
   - Check ZenoPay dashboard for webhook logs

2. **Payment status stuck in pending**
   - Use the manual status check endpoint
   - Check ZenoPay transaction status directly
   - Verify phone number format (07XXXXXXXX)

3. **Authentication errors**
   - Verify ZenoPay API key is correct
   - Check API key permissions in ZenoPay dashboard
   - Ensure API key is for correct environment (test/prod)

### Support Contacts:

- **ZenoPay Support**: support@zenoapi.com
- **ZenoPay Website**: https://zenoapi.com

## 🎯 Next Steps

After completing the backend integration:

1. **Update Mobile App** - Integrate mobile money payment flow
2. **Update Web App** - Add mobile money payment option  
3. **Update CMS** - Add payment monitoring dashboard
4. **Testing** - Comprehensive testing with real transactions
5. **Go Live** - Deploy to production with monitoring

This completes the ZenoPay integration for your Daladala Smart backend! 🚀