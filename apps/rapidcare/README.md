# RapidCare Backend API

A Node.js + Express.js backend API for the RapidCare emergency medical platform - delivering fast access to critical care resources.

## Features

- Hospital resource management (beds, ICUs, operation theatres)
- Real-time booking system
- Sample collection service for medical tests (accessible without authentication)
- Blood donation requests and donor matching
- JWT Authentication and Authorization
- Role-based access control (Users & Hospital Authorities)
- RESTful API endpoints
- SQLite database integration

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite with better-sqlite3
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Built-in validation with SQLite constraints
- **Deployment**: Render/Railway compatible

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   PORT=5000
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   NODE_ENV=development
   ```
   
   Note: No database connection string needed as SQLite uses a local file.
4. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile (authenticated)
- `PUT /api/auth/profile` - Update user profile (authenticated)
- `PUT /api/auth/change-password` - Change password (authenticated)
- `GET /api/auth/users` - Get all users (hospital authority only)
- `GET /api/auth/hospital-authorities` - Get hospital authorities (hospital authority only)
- `POST /api/auth/assign-hospital` - Assign hospital to authority (hospital authority only)
- `PUT /api/auth/users/:id/deactivate` - Deactivate user (hospital authority only)

### Hospitals

- `GET /api/hospitals` - Get all hospitals (public)
- `GET /api/hospitals/search` - Search hospitals (public)
- `GET /api/hospitals/resources` - Get hospitals with available resources (public)
- `GET /api/hospitals/:id` - Get specific hospital (public)
- `POST /api/hospitals` - Create new hospital (hospital authority only)
- `PUT /api/hospitals/:id/resources` - Update hospital resources (hospital authority only)

### Bookings

- `POST /api/bookings` - Create new booking (authenticated users)
- `GET /api/bookings/user` - Get current user bookings (authenticated users)
- `GET /api/bookings/:id` - Get specific booking (authenticated users)
- `PUT /api/bookings/:id/status` - Update booking status (hospital authority only)
- `DELETE /api/bookings/:id` - Cancel booking (authenticated users)
- `GET /api/bookings` - Get all bookings (hospital authority only)

### Blood Requests

- `POST /api/blood/request` - Create blood request (authenticated users)
- `GET /api/blood/requests` - Get all blood requests (authenticated users)
- `GET /api/blood/requests/search` - Search blood requests (authenticated users)
- `GET /api/blood/requests/:id` - Get specific blood request (authenticated users)
- `PUT /api/blood/requests/:id/status` - Update blood request status (hospital authority only)
- `POST /api/blood/requests/:id/match` - Match donor to blood request (authenticated users)
- `PUT /api/blood/requests/:id/donors/:donorId` - Update donor status (authenticated users)

### Sample Collection

- `GET /api/sample-collection/hospitals` - Get hospitals offering collection services (public)
- `GET /api/sample-collection/test-types` - Get all available test types (public)
- `GET /api/sample-collection/hospitals/:hospitalId/test-types` - Get test types for hospital (public)
- `POST /api/sample-collection/calculate-pricing` - Calculate test pricing (public)
- `POST /api/sample-collection/submit-request` - Submit collection request (public, optional auth)
- `GET /api/sample-collection/requests` - Get user's requests (authenticated users)
- `GET /api/sample-collection/requests/:requestId` - Get specific request (authenticated users)
- `PUT /api/sample-collection/requests/:requestId/cancel` - Cancel request (authenticated users)

## Database Schema

### Users Table
- User authentication (email, password)
- User information (name, phone)
- User type (user, hospital-authority)
- Account status

### Hospital Authorities Table
- Links users to hospitals
- Role-based permissions (admin, manager, staff)
- Hospital assignment

### Hospitals Table
- Basic information (name, address, contact)
- Resource availability (beds, ICUs, operation theatres)
- Surgeon information and availability
- Services offered

### Bookings Table
- Patient information
- Resource type and hospital
- Scheduling details
- Payment information
- Status tracking

### Blood Requests Table
- Requester information
- Blood type and units needed
- Hospital and patient details
- Donor matching system

### Sample Collection Tables
- **Sample Collection Requests**: Collection requests with optional user association
- **Test Types**: Available medical tests with pricing
- **Collection Agents**: Agents assigned to collection requests
- **Hospital Test Pricing**: Test pricing per hospital

### Additional Tables
- **Surgeons**: Hospital surgeons with schedules
- **Hospital Resources**: Resource availability tracking
- **Hospital Services**: Services offered by each hospital
- **Matched Donors**: Donor matching for blood requests

## Development

- Run in development mode: `npm run dev`
- Run in production mode: `npm start`
- Seed database: `npm run seed`

## Sample Users

After running the seeder, you can use these sample accounts:

### Regular User
- Email: `user@example.com`
- Password: `password123`

### Hospital Authority (Manager)
- Email: `hospital@example.com`
- Password: `password123`
- Assigned to: City General Hospital

### Hospital Authority (Admin)
- Email: `admin@example.com`
- Password: `password123`
- Assigned to: Metropolitan Medical Center

## Deployment

The backend is designed to be deployed on Render or Railway. The SQLite database file will be created automatically when the application starts.

### Environment Variables for Production
- `PORT`: Server port (usually set by hosting platform)
- `JWT_SECRET`: Secure JWT secret key
- `NODE_ENV`: Set to 'production'

### Database Persistence
- SQLite database file is created at `database.sqlite` in the project root
- For production deployments, consider using a persistent volume or migrating to PostgreSQL 