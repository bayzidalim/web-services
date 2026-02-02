const express = require('express');
const router = express.Router();
const db = require('../config/database');

// One-time setup endpoint - REMOVE AFTER FIRST USE
router.post('/seed', async (req, res) => {
  try {
    // Check if already seeded
    const hospitalCount = db.prepare('SELECT COUNT(*) as count FROM hospitals').get();
    
    if (hospitalCount.count > 0) {
      return res.json({
        success: false,
        message: 'Database already contains hospitals. Seeding skipped for safety.',
        count: hospitalCount.count
      });
    }

    // Import services directly instead of using the seeder
    const HospitalService = require('../services/hospitalService');
    const UserService = require('../services/userService');

    // Sample hospitals data
    const sampleHospitals = [
      {
        name: "Dhaka Medical College Hospital",
        address: { street: "32 Shahbag Avenue", city: "Dhaka", state: "Dhaka", zipCode: "1000", country: "Bangladesh" },
        contact: { phone: "+880-2-55165088", email: "info@dmch.gov.bd", emergency: "+880-2-55165088" },
        resources: { beds: { total: 200, available: 45, occupied: 155 }, icu: { total: 30, available: 8, occupied: 22 }, operationTheatres: { total: 8, available: 3, occupied: 5 } },
        surgeons: [{ name: "Dr. Mohammad Rahman", specialization: "Cardiovascular Surgery", available: true, schedule: { days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], hours: "8:00 AM - 6:00 PM" } }],
        services: ["Emergency Care", "Cardiology", "Neurology", "Orthopedics", "Pediatrics"],
        rating: 4.5
      },
      {
        name: "Chittagong Medical College Hospital",
        address: { street: "Chawk Bazar", city: "Chattogram", state: "Chattogram", zipCode: "4000", country: "Bangladesh" },
        contact: { phone: "+880-31-619441", email: "contact@cmch.gov.bd", emergency: "+880-31-619441" },
        resources: { beds: { total: 150, available: 25, occupied: 125 }, icu: { total: 20, available: 5, occupied: 15 }, operationTheatres: { total: 6, available: 2, occupied: 4 } },
        surgeons: [{ name: "Dr. Farhana Akter", specialization: "General Surgery", available: true, schedule: { days: ["Monday", "Wednesday", "Saturday"], hours: "7:00 AM - 7:00 PM" } }],
        services: ["Emergency Care", "General Surgery", "Oncology", "Radiology"],
        rating: 4.2
      },
      {
        name: "Rajshahi Medical College Hospital",
        address: { street: "Laxmipur", city: "Rajshahi", state: "Rajshahi", zipCode: "6000", country: "Bangladesh" },
        contact: { phone: "+880-721-775393", email: "info@rmch.gov.bd", emergency: "+880-721-775393" },
        resources: { beds: { total: 100, available: 15, occupied: 85 }, icu: { total: 15, available: 3, occupied: 12 }, operationTheatres: { total: 4, available: 1, occupied: 3 } },
        surgeons: [{ name: "Dr. Shafiqul Islam", specialization: "Orthopedic Surgery", available: true, schedule: { days: ["Sunday", "Tuesday", "Thursday"], hours: "8:00 AM - 6:00 PM" } }],
        services: ["Emergency Care", "Orthopedics", "Physical Therapy", "Rehabilitation"],
        rating: 4.0
      }
    ];

    // Insert hospitals
    const hospitals = [];
    for (const hospitalData of sampleHospitals) {
      const hospital = HospitalService.create(hospitalData);
      hospitals.push(hospital);
    }

    // Create sample users
    const sampleUsers = [
      { email: 'user@example.com', password: 'password123', name: 'Abdul Karim', phone: '+880-1711-000001', userType: 'user' },
      { email: 'hospital@example.com', password: 'password123', name: 'Dr. Nusrat Jahan', phone: '+880-1711-000002', userType: 'hospital-authority' },
      { email: 'admin@example.com', password: 'password123', name: 'Shamim Ahmed', phone: '+880-1711-000003', userType: 'admin' }
    ];

    const users = [];
    for (const userData of sampleUsers) {
      const user = await UserService.register(userData);
      users.push(user);
    }

    // Assign hospitals to authorities
    if (hospitals.length > 0 && users.length > 1) {
      UserService.assignHospital(users[1].id, hospitals[0].id, 'manager');
      UserService.assignHospital(users[2].id, hospitals[1].id, 'admin');
    }

    res.json({
      success: true,
      message: 'Database seeded successfully!',
      hospitals: hospitals.length,
      users: users.length,
      credentials: {
        admin: { email: 'admin@example.com', password: 'password123' },
        hospital: { email: 'hospital@example.com', password: 'password123' },
        user: { email: 'user@example.com', password: 'password123' }
      }
    });
  } catch (error) {
    console.error('Setup seed error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Check database status
router.get('/status', (req, res) => {
  try {
    const hospitalCount = db.prepare('SELECT COUNT(*) as count FROM hospitals').get();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get();

    res.json({
      success: true,
      database: {
        hospitals: hospitalCount.count,
        users: userCount.count,
        bookings: bookingCount.count
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
