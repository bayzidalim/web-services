# Hospital Authority Linking Fix

## Problem Description

Hospital authority users were unable to approve bookings because they had `hospitalId: null` in the `hospital_authorities` table, even though they were properly linked to hospitals in the `users` table.

## Root Cause

The issue occurred during the hospital registration process:

1. **UserService.register()** created a `hospital_authorities` record with `hospitalId: null`
2. **HospitalService.createWithApproval()** updated the `users` table with `hospital_id` but **failed to update the `hospital_authorities` table**

This caused a mismatch where:
- `users.hospital_id` = valid hospital ID
- `hospital_authorities.hospitalId` = null

## Solution Implemented

### 1. Fixed Hospital Registration Flow

**File:** `services/hospitalService.js`

Added code to update the `hospital_authorities` table when creating a hospital:

```javascript
// Update hospital_authorities table to link the user to the hospital
const authorityStmt = db.prepare(`
  UPDATE hospital_authorities 
  SET hospitalId = ?
  WHERE userId = ?
`);
authorityStmt.run(hospitalId, authorityUserId);
```

### 2. Database Constraints and Triggers

**File:** `migrations/012_fix_hospital_authority_constraints.js`

Created database triggers to prevent future issues:

- **Trigger 1:** `ensure_hospital_authority_linked` - Ensures hospital_authorities.hospitalId is set when a hospital-authority user is created
- **Trigger 2:** `sync_hospital_authority_on_user_update` - Syncs hospital_authorities.hospitalId when users.hospital_id is updated
- **View:** `hospital_authority_validation` - Easy way to identify users with linking issues

### 3. Validation Service

**File:** `services/hospitalAuthorityValidationService.js`

Created a comprehensive validation service that:

- Validates all hospital authority users
- Automatically fixes common issues
- Provides detailed status reporting
- Can be run manually or automatically

### 4. Automated Validation Scripts

**Files:**
- `scripts/validate-hospital-authorities.js` - Manual validation script
- `scripts/startup-validation.js` - Automatic validation on server startup

### 5. Testing

**File:** `tests/hospital-authority-registration.test.js`

Created comprehensive tests to ensure the fix works for new registrations.

## Files Modified/Created

### Modified Files:
- `services/hospitalService.js` - Fixed hospital creation to update hospital_authorities
- `index.js` - Added startup validation

### New Files:
- `migrations/012_fix_hospital_authority_constraints.js` - Database constraints
- `services/hospitalAuthorityValidationService.js` - Validation service
- `scripts/validate-hospital-authorities.js` - Manual validation script
- `scripts/startup-validation.js` - Startup validation
- `tests/hospital-authority-registration.test.js` - Test suite
- `docs/HOSPITAL_AUTHORITY_FIX.md` - This documentation

## How to Use

### Manual Validation
```bash
cd back-end
node scripts/validate-hospital-authorities.js
```

### Run Tests
```bash
cd back-end
node tests/hospital-authority-registration.test.js
```

### Check Validation Status
```javascript
const HospitalAuthorityValidationService = require('./services/hospitalAuthorityValidationService');
const status = HospitalAuthorityValidationService.getValidationStatus();
console.log(status);
```

## Prevention Measures

1. **Database Triggers** - Automatically sync hospital_authorities when users table is updated
2. **Startup Validation** - Runs automatically when server starts
3. **Comprehensive Tests** - Ensures new registrations work correctly
4. **Validation Service** - Can be called programmatically to check status

## Status

✅ **All existing hospital authority users have been fixed**
✅ **New registrations will work correctly**
✅ **Database constraints prevent future issues**
✅ **Automated validation runs on startup**
✅ **Comprehensive testing in place**

## Verification

To verify the fix is working:

1. **Check existing users:**
   ```bash
   node scripts/validate-hospital-authorities.js
   ```

2. **Test new registration:**
   ```bash
   node tests/hospital-authority-registration.test.js
   ```

3. **Check database directly:**
   ```sql
   SELECT * FROM hospital_authority_validation;
   ```

All hospital authority users should now be able to approve bookings from their dashboard.
