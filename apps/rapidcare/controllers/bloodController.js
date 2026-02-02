const BloodRequestService = require('../services/bloodRequestService');

// Create blood request
exports.createBloodRequest = async (req, res) => {
  try {
    const {
      requesterName,
      requesterPhone,
      bloodType,
      units,
      urgency,
      hospitalName,
      hospitalAddress,
      hospitalContact,
      patientName,
      patientAge,
      medicalCondition,
      requiredBy,
      notes
    } = req.body;

    const requestData = {
      requesterId: req.user.id, // Use authenticated user's ID
      requesterName: requesterName || req.user.name,
      requesterPhone: requesterPhone || req.user.phone,
      bloodType,
      units,
      urgency,
      hospitalName,
      hospitalAddress,
      hospitalContact,
      patientName,
      patientAge,
      medicalCondition,
      requiredBy,
      notes
    };

    const bloodRequest = BloodRequestService.create(requestData);

    res.status(201).json({
      success: true,
      data: bloodRequest,
      message: 'Blood request created successfully'
    });
  } catch (error) {
    console.error('Error creating blood request:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get all blood requests
exports.getAllBloodRequests = async (req, res) => {
  try {
    const { status, bloodType, urgency } = req.query;
    const bloodRequests = BloodRequestService.search({ status, bloodType, urgency });

    res.json({
      success: true,
      data: bloodRequests,
      count: bloodRequests.length
    });
  } catch (error) {
    console.error('Error fetching blood requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blood requests'
    });
  }
};

// Get specific blood request
exports.getBloodRequestById = async (req, res) => {
  try {
    const bloodRequest = BloodRequestService.getById(req.params.id);

    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        error: 'Blood request not found'
      });
    }

    res.json({
      success: true,
      data: bloodRequest
    });
  } catch (error) {
    console.error('Error fetching blood request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blood request'
    });
  }
};

// Update blood request status
exports.updateBloodRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    BloodRequestService.updateStatus(id, status);
    const bloodRequest = BloodRequestService.getById(id);

    res.json({
      success: true,
      data: bloodRequest,
      message: 'Blood request status updated successfully'
    });
  } catch (error) {
    console.error('Error updating blood request status:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Match donor to blood request
exports.matchDonor = async (req, res) => {
  try {
    const { id } = req.params;
    const { donorId, donorName, donorPhone } = req.body;

    const donorData = { donorId, donorName, donorPhone };
    BloodRequestService.addMatchedDonor(id, donorData);
    const bloodRequest = BloodRequestService.getById(id);

    res.json({
      success: true,
      data: bloodRequest,
      message: 'Donor matched successfully'
    });
  } catch (error) {
    console.error('Error matching donor:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Update donor status
exports.updateDonorStatus = async (req, res) => {
  try {
    const { id, donorId } = req.params;
    const { status } = req.body;

    BloodRequestService.updateDonorStatus(id, donorId, status);
    const bloodRequest = BloodRequestService.getById(id);

    res.json({
      success: true,
      data: bloodRequest,
      message: 'Donor status updated successfully'
    });
  } catch (error) {
    console.error('Error updating donor status:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Search blood requests
exports.searchBloodRequests = async (req, res) => {
  try {
    const { bloodType, city, urgency } = req.query;
    const bloodRequests = BloodRequestService.search({ bloodType, city, urgency });

    res.json({
      success: true,
      data: bloodRequests,
      count: bloodRequests.length
    });
  } catch (error) {
    console.error('Error searching blood requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search blood requests'
    });
  }
};

// Get current user's blood requests (for profile page)
exports.getCurrentUserBloodRequests = async (req, res) => {
  try {
    const bloodRequests = BloodRequestService.search({ requesterId: req.user.id });

    res.json({
      success: true,
      data: bloodRequests,
      count: bloodRequests.length
    });
  } catch (error) {
    console.error('Error fetching current user blood requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blood requests'
    });
  }
}; 