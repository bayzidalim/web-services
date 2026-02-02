const UserService = require('../services/userService');
const HospitalService = require('../services/hospitalService');

// Register new user
exports.register = async (req, res) => {
  try {
    const { email, password, name, phone, userType, hospital } = req.body;

    // Validate required fields
    if (!email || !password || !name || !userType) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, name, and userType are required'
      });
    }

    // Validate userType
    if (!['user', 'hospital-authority', 'admin'].includes(userType)) {
      return res.status(400).json({
        success: false,
        error: 'userType must be either "user", "hospital-authority" or "admin"'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    // For hospital authorities, validate hospital data
    if (userType === 'hospital-authority') {
      if (!hospital) {
        return res.status(400).json({
          success: false,
          error: 'Hospital information is required for hospital authority registration'
        });
      }

      // Validate required hospital fields (capacity is now optional)
      const requiredHospitalFields = ['name', 'type', 'address', 'contact'];
      const requiredAddressFields = ['street', 'city', 'state', 'zipCode', 'country'];
      const requiredContactFields = ['phone', 'email', 'emergency'];

      for (const field of requiredHospitalFields) {
        if (!hospital[field]) {
          return res.status(400).json({
            success: false,
            error: `Hospital ${field} is required`
          });
        }
      }

      for (const field of requiredAddressFields) {
        if (!hospital.address[field]) {
          return res.status(400).json({
            success: false,
            error: `Hospital address ${field} is required`
          });
        }
      }

      for (const field of requiredContactFields) {
        if (!hospital.contact[field]) {
          return res.status(400).json({
            success: false,
            error: `Hospital contact ${field} is required`
          });
        }
      }

      // Set default capacity values if not provided
      if (!hospital.capacity) {
        hospital.capacity = {
          totalBeds: 0,
          icuBeds: 0,
          operationTheaters: 0
        };
      } else {
        // Validate capacity fields if provided (ensure non-negative)
        const capacityFields = ['totalBeds', 'icuBeds', 'operationTheaters'];
        for (const field of capacityFields) {
          if (hospital.capacity[field] === undefined) {
            hospital.capacity[field] = 0;
          } else if (hospital.capacity[field] < 0) {
            return res.status(400).json({
              success: false,
              error: `Hospital capacity ${field} must be non-negative`
            });
          }
        }
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(hospital.contact.email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid hospital email format'
        });
      }
    }

    // Register the user first
    const user = await UserService.register({
      email,
      password,
      name,
      phone,
      userType
    });

    let hospitalData = null;

    // If hospital authority, create the hospital
    if (userType === 'hospital-authority') {
      try {
        hospitalData = HospitalService.createWithApproval(hospital, user.id);
      } catch (hospitalError) {
        // If hospital creation fails, we should ideally rollback user creation
        // For now, we'll return an error
        console.error('Error creating hospital:', hospitalError);
        return res.status(400).json({
          success: false,
          error: 'Failed to create hospital: ' + hospitalError.message
        });
      }
    }

    const responseData = {
      user,
      ...(hospitalData && { hospital: hospitalData })
    };

    const message = userType === 'hospital-authority' 
      ? 'Hospital authority registered successfully. Your hospital is pending approval.'
      : 'User registered successfully';

    res.status(201).json({
      success: true,
      data: responseData,
      message
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const result = await UserService.login(email, password);

    res.json({
      success: true,
      data: result,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = UserService.getById(req.user.id);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    const user = UserService.updateProfile(req.user.id, { name, phone });

    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
    }

    const result = await UserService.changePassword(req.user.id, currentPassword, newPassword);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get all users (admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = UserService.getAll();

    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
};

// Get hospital authorities
exports.getHospitalAuthorities = async (req, res) => {
  try {
    const authorities = UserService.getHospitalAuthorities();

    res.json({
      success: true,
      data: authorities,
      count: authorities.length
    });
  } catch (error) {
    console.error('Error fetching hospital authorities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital authorities'
    });
  }
};

// Assign hospital to hospital authority
exports.assignHospital = async (req, res) => {
  try {
    const { userId, hospitalId, role } = req.body;

    // Validate required fields
    if (!userId || !hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and Hospital ID are required'
      });
    }

    // Validate role
    if (role && !['admin', 'manager', 'staff'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be admin, manager, or staff'
      });
    }

    const user = UserService.assignHospital(userId, hospitalId, role);

    res.json({
      success: true,
      data: user,
      message: 'Hospital assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning hospital:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Deactivate user
exports.deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    UserService.deactivateUser(id);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
