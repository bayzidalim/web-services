# Backend Utilities

This directory contains utility scripts for database management and system administration.

## Available Scripts

### 1. Database Seeding

#### `seeder.js`
Seeds the database with sample hospitals, users, and initial data.

```bash
npm run seed
```

#### `financialSeeder.js`
Seeds financial test data including transactions, pricing, and balances.

```bash
npm run seed:financial
```

### 2. Hospital Credential Assignment

#### `assignHospitalCredentials.js`
Automatically creates or updates hospital authority user accounts for all approved hospitals in the system.

**Usage:**
```bash
npm run assign:credentials
```

**What it does:**
- Scans all approved hospitals in the database
- Creates a hospital-authority user account for each hospital
- Generates secure random passwords
- Links each user account to their respective hospital
- Outputs credentials to console and saves to `hospital_credentials.json`

**Output Files:**
- `back-end/hospital_credentials.json` - JSON format credentials
- `HOSPITAL_CREDENTIALS.md` - Human-readable credentials document (root directory)

**Features:**
- Automatically generates unique usernames based on hospital email or name
- Creates secure random passwords with format: `Hospital@{id}{random}`
- Updates existing accounts if they already exist
- Skips duplicate hospitals to prevent conflicts
- Provides detailed console output with success/error messages

**Security Notes:**
- Generated credentials are saved to files that are in `.gitignore`
- Passwords are hashed using bcrypt before storing in database
- Original passwords are only shown once during generation
- Recommend changing passwords after first login in production

**Example Output:**
```
1. Dhaka Medical College Hospital
   Hospital ID: 760
   User ID: 10048
   Username/Email: info@dmch.gov.bd
   Password: Hospital@760b9gg
   Login URL: http://localhost:3000/login
```

### 3. Currency Utilities

#### `currencyUtils.js`
Provides currency formatting and conversion utilities for the payment system.

### 4. Error Handler

#### `errorHandler.js`
Centralized error handling middleware for Express routes.

### 5. Security Utilities

#### `securityUtils.js`
Security-related utilities including encryption, validation, and fraud detection helpers.

### 6. Notification Processor

#### `notificationProcessor.js`
Background processor for handling notification delivery and queuing.

### 7. Polling Client

#### `pollingClient.js`
Client-side polling utilities for real-time updates.

## Development Workflow

1. **Initial Setup:**
   ```bash
   npm run migrate        # Run database migrations
   npm run seed           # Seed initial data
   npm run assign:credentials  # Create hospital accounts
   ```

2. **Adding Financial Test Data:**
   ```bash
   npm run seed:financial
   ```

3. **Resetting Hospital Credentials:**
   ```bash
   npm run assign:credentials
   ```
   This will update all existing hospital accounts with new passwords.

## Notes

- All seeding scripts are idempotent - safe to run multiple times
- Credential assignment updates existing accounts rather than creating duplicates
- Always check the output files after running credential assignment
- Keep credential files secure and never commit them to version control
