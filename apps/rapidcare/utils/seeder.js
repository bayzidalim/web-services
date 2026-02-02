const HospitalService = require('../services/hospitalService');
const UserService = require('../services/userService');
require('dotenv').config();

const sampleHospitals = [
  {
    name: "Dhaka Medical College Hospital",
    address: {
      street: "32 Shahbag Avenue",
      city: "Dhaka",
      state: "Dhaka",
      zipCode: "1000",
      country: "Bangladesh"
    },
    contact: {
      phone: "+880-2-55165088",
      email: "info@dmch.gov.bd",
      emergency: "+880-2-55165088"
    },
    resources: {
      beds: {
        total: 200,
        available: 45,
        occupied: 155
      },
      icu: {
        total: 30,
        available: 8,
        occupied: 22
      },
      operationTheatres: {
        total: 8,
        available: 3,
        occupied: 5
      }
    },
    surgeons: [
      {
        name: "Dr. Mohammad Rahman",
        specialization: "Cardiovascular Surgery",
        available: true,
        schedule: {
          days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
          hours: "8:00 AM - 6:00 PM"
        }
      },
      {
        name: "Dr. Nusrat Jahan",
        specialization: "Neurology",
        available: true,
        schedule: {
          days: ["Sunday", "Tuesday", "Thursday"],
          hours: "9:00 AM - 5:00 PM"
        }
      }
    ],
    services: ["Emergency Care", "Cardiology", "Neurology", "Orthopedics", "Pediatrics"],
    rating: 4.5
  },
  {
    name: "Chittagong Medical College Hospital",
    address: {
      street: "Chawk Bazar",
      city: "Chattogram",
      state: "Chattogram",
      zipCode: "4000",
      country: "Bangladesh"
    },
    contact: {
      phone: "+880-31-619441",
      email: "contact@cmch.gov.bd",
      emergency: "+880-31-619441"
    },
    resources: {
      beds: {
        total: 150,
        available: 25,
        occupied: 125
      },
      icu: {
        total: 20,
        available: 5,
        occupied: 15
      },
      operationTheatres: {
        total: 6,
        available: 2,
        occupied: 4
      }
    },
    surgeons: [
      {
        name: "Dr. Farhana Akter",
        specialization: "General Surgery",
        available: true,
        schedule: {
          days: ["Monday", "Wednesday", "Saturday"],
          hours: "7:00 AM - 7:00 PM"
        }
      }
    ],
    services: ["Emergency Care", "General Surgery", "Oncology", "Radiology"],
    rating: 4.2
  },
  {
    name: "Rajshahi Medical College Hospital",
    address: {
      street: "Laxmipur",
      city: "Rajshahi",
      state: "Rajshahi",
      zipCode: "6000",
      country: "Bangladesh"
    },
    contact: {
      phone: "+880-721-775393",
      email: "info@rmch.gov.bd",
      emergency: "+880-721-775393"
    },
    resources: {
      beds: {
        total: 100,
        available: 15,
        occupied: 85
      },
      icu: {
        total: 15,
        available: 3,
        occupied: 12
      },
      operationTheatres: {
        total: 4,
        available: 1,
        occupied: 3
      }
    },
    surgeons: [
      {
        name: "Dr. Shafiqul Islam",
        specialization: "Orthopedic Surgery",
        available: true,
        schedule: {
          days: ["Sunday", "Tuesday", "Thursday"],
          hours: "8:00 AM - 6:00 PM"
        }
      }
    ],
    services: ["Emergency Care", "Orthopedics", "Physical Therapy", "Rehabilitation"],
    rating: 4.0
  }
];

const seedDatabase = async () => {
  try {
    console.log('Connected to SQLite database');

    // Clear existing data (this will be handled by the service)
    console.log('Cleared existing hospital data');

    // Insert sample hospitals
    const hospitals = [];
    for (const hospitalData of sampleHospitals) {
        try {
            const existingHospital = HospitalService.search({ q: hospitalData.name, city: hospitalData.address.city });
            if (existingHospital.length > 0) {
                hospitals.push(existingHospital[0]);
                console.log(`Hospital "${hospitalData.name}" in "${hospitalData.address.city}" already exists, using existing hospital.`);
            } else {
                const hospital = HospitalService.create(hospitalData);
                hospitals.push(hospital);
            }
        } catch (error) {
            if (error.message.includes('already exists')) {
                const existingHospital = HospitalService.search({ q: hospitalData.name, city: hospitalData.address.city });
                if (existingHospital.length > 0) {
                    hospitals.push(existingHospital[0]);
                    console.log(`Hospital "${hospitalData.name}" in "${hospitalData.address.city}" already exists, using existing hospital.`);
                }
            } else {
                throw error;
            }
        }
    }
    console.log(`Processed ${hospitals.length} hospitals`);

    // Create sample users
    const sampleUsers = [
      {
        email: 'user@example.com',
        password: 'password123',
        name: 'Abdul Karim',
        phone: '+880-1711-000001',
        userType: 'user'
      },
      {
        email: 'hospital@example.com',
        password: 'password123',
        name: 'Dr. Nusrat Jahan',
        phone: '+880-1711-000002',
        userType: 'hospital-authority'
      },
      {
        email: 'admin@example.com',
        password: 'password123',
        name: 'Shamim Ahmed',
        phone: '+880-1711-000003',
        userType: 'admin'
      }
    ];

    const users = [];
    for (const userData of sampleUsers) {
      try {
        const user = await UserService.register(userData);
        users.push(user);
      } catch (error) {
        if (error.message.includes('already exists')) {
          // User already exists, get the existing user
          const existingUser = UserService.getByEmail(userData.email);
          if (existingUser) {
            users.push(existingUser);
            console.log(`User ${userData.email} already exists, using existing user`);
          }
        } else {
          throw error;
        }
      }
    }
    console.log(`Processed ${users.length} users`);

    // Assign hospitals to hospital authorities
    if (hospitals.length > 0 && users.length > 1) {
      UserService.assignHospital(users[1].id, hospitals[0].id, 'manager'); // Dr. Nusrat Jahan -> Dhaka Medical College Hospital
      UserService.assignHospital(users[2].id, hospitals[1].id, 'admin'); // Shamim Ahmed -> Chittagong Medical College Hospital
      console.log('Assigned hospitals to authorities');
    }

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run seeder if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase }; 