# Shree RBSK Referral Management System

Clean/mobile-first referral prototype with:
- Mobile + password login architecture
- Registration page
- Dashboard and status cards
- New Referral modal
- Defect / Health Problem
- School Class / AWC Worker Number conditional fields
- Referred / Treatment Started hospital name
- Estimated Treatment Expenditure
- Search and filters
- Demo mode using localStorage

Firebase configuration is in `js/firebase-config.js`.

Note: Firebase Auth has no native mobile-number/password provider. This build maps a mobile number to an internal email-style identifier for the authentication prototype. Production authentication should be finalized before deployment.
