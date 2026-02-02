const SampleCollection = require('../models/SampleCollection');
const CollectionAgent = require('../models/CollectionAgent');
const ErrorHandler = require('../utils/errorHandler');

class SampleCollectionService {
  constructor(database) {
    this.db = database;
    this.sampleCollection = new SampleCollection(database);
    this.collectionAgent = new CollectionAgent(database);
  }

  /**
   * Create a new sample collection request
   */
  async createCollectionRequest(requestData) {
    try {
      const {
        userId,
        hospitalId,
        testTypeIds,
        patientName,
        patientPhone,
        collectionAddress,
        preferredTime,
        specialInstructions
      } = requestData;

      // Validate hospital exists and offers home collection
      const hospital = this.db.prepare('SELECT * FROM hospitals WHERE id = ?').get(hospitalId);
      if (!hospital) {
        throw ErrorHandler.createError('Hospital not found', 404);
      }

      // Validate test types are available at the hospital
      const availableTests = this.sampleCollection.getHospitalTestTypes(hospitalId);
      const availableTestIds = availableTests.map(test => test.id);
      
      const invalidTests = testTypeIds.filter(id => !availableTestIds.includes(id));
      if (invalidTests.length > 0) {
        throw ErrorHandler.createError(
          `Some tests are not available at this hospital: ${invalidTests.join(', ')}`,
          400
        );
      }

      // Calculate estimated price
      const pricing = this.sampleCollection.calculateEstimatedPrice(hospitalId, testTypeIds);

      // Create the request
      const request = this.sampleCollection.createRequest({
        userId,
        hospitalId,
        testTypes: testTypeIds,
        patientName,
        patientPhone,
        collectionAddress,
        preferredTime,
        specialInstructions
      });

      // Auto-assign an available agent
      const availableAgent = this.collectionAgent.getAvailableAgent(hospitalId);
      if (availableAgent) {
        this.sampleCollection.assignAgent(request.id, availableAgent.id);
        this.sampleCollection.updateStatus(request.id, 'assigned', {
          estimatedPrice: `${pricing.total} BDT`
        });
      } else {
        this.sampleCollection.updateStatus(request.id, 'pending', {
          estimatedPrice: `${pricing.total} BDT`
        });
      }

      // Get the updated request with agent info
      const finalRequest = this.sampleCollection.getRequestById(request.id);
      
      // Add test details and pricing breakdown
      finalRequest.testDetails = availableTests.filter(test => 
        testTypeIds.includes(test.id)
      );
      finalRequest.pricing = pricing;

      return {
        success: true,
        data: finalRequest,
        message: availableAgent 
          ? `Request created successfully. ${availableAgent.name} will contact you soon.`
          : 'Request created successfully. An agent will be assigned shortly.'
      };

    } catch (error) {
      console.error('Error creating collection request:', error);
      throw ErrorHandler.handleError(error, 'Failed to create collection request');
    }
  }

  /**
   * Get collection requests for a user
   */
  async getUserRequests(userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const requests = this.sampleCollection.getRequestsByUserId(userId, limit, offset);

      // Add test details for each request
      const enrichedRequests = requests.map(request => {
        const testDetails = this.getTestDetailsByIds(request.test_types || []);
        return {
          ...request,
          testDetails
        };
      });

      return {
        success: true,
        data: enrichedRequests,
        pagination: {
          page,
          limit,
          hasMore: requests.length === limit
        }
      };

    } catch (error) {
      console.error('Error getting user requests:', error);
      throw ErrorHandler.handleError(error, 'Failed to get collection requests');
    }
  }

  /**
   * Get collection requests for a hospital
   */
  async getHospitalRequests(hospitalId, status = null, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      const requests = this.sampleCollection.getRequestsByHospitalId(
        hospitalId, 
        status, 
        limit, 
        offset
      );

      // Add test details for each request
      const enrichedRequests = requests.map(request => {
        const testDetails = this.getTestDetailsByIds(request.test_types || []);
        return {
          ...request,
          testDetails
        };
      });

      return {
        success: true,
        data: enrichedRequests,
        pagination: {
          page,
          limit,
          hasMore: requests.length === limit
        }
      };

    } catch (error) {
      console.error('Error getting hospital requests:', error);
      throw ErrorHandler.handleError(error, 'Failed to get hospital collection requests');
    }
  }

  /**
   * Get a specific collection request
   */
  async getRequestById(requestId, userId = null) {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      // If userId is provided, verify ownership
      if (userId && request.user_id !== userId) {
        throw ErrorHandler.createError('Access denied', 403);
      }

      // Add test details
      const testDetails = this.getTestDetailsByIds(request.test_types || []);
      request.testDetails = testDetails;

      return {
        success: true,
        data: request
      };

    } catch (error) {
      console.error('Error getting collection request:', error);
      throw ErrorHandler.handleError(error, 'Failed to get collection request');
    }
  }

  /**
   * Update collection request status
   */
  async updateRequestStatus(requestId, status, additionalData = {}, userId = null) {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      // If userId is provided, verify ownership (for user updates)
      if (userId && request.user_id !== userId) {
        throw ErrorHandler.createError('Access denied', 403);
      }

      const updated = this.sampleCollection.updateStatus(requestId, status, additionalData);
      
      if (!updated) {
        throw ErrorHandler.createError('Failed to update request status', 500);
      }

      const updatedRequest = this.sampleCollection.getRequestById(requestId);
      
      return {
        success: true,
        data: updatedRequest,
        message: `Request status updated to ${status}`
      };

    } catch (error) {
      console.error('Error updating request status:', error);
      throw ErrorHandler.handleError(error, 'Failed to update request status');
    }
  }

  /**
   * Assign agent to a request
   */
  async assignAgentToRequest(requestId, agentId = null) {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      let agent;
      if (agentId) {
        agent = this.collectionAgent.getById(agentId);
        if (!agent || agent.hospital_id !== request.hospital_id) {
          throw ErrorHandler.createError('Invalid agent for this hospital', 400);
        }
      } else {
        // Auto-assign available agent
        agent = this.collectionAgent.getAvailableAgent(request.hospital_id);
        if (!agent) {
          throw ErrorHandler.createError('No agents available at this time', 404);
        }
      }

      const assigned = this.sampleCollection.assignAgent(requestId, agent.id);
      
      if (!assigned) {
        throw ErrorHandler.createError('Failed to assign agent', 500);
      }

      const updatedRequest = this.sampleCollection.getRequestById(requestId);
      
      return {
        success: true,
        data: updatedRequest,
        message: `Agent ${agent.name} assigned successfully`
      };

    } catch (error) {
      console.error('Error assigning agent:', error);
      throw ErrorHandler.handleError(error, 'Failed to assign agent');
    }
  }

  /**
   * Get available test types for a hospital
   */
  async getHospitalTestTypes(hospitalId) {
    try {
      const hospital = this.db.prepare('SELECT * FROM hospitals WHERE id = ?').get(hospitalId);
      if (!hospital) {
        throw ErrorHandler.createError('Hospital not found', 404);
      }

      const testTypes = this.sampleCollection.getHospitalTestTypes(hospitalId);
      
      return {
        success: true,
        data: testTypes
      };

    } catch (error) {
      console.error('Error getting hospital test types:', error);
      throw ErrorHandler.handleError(error, 'Failed to get hospital test types');
    }
  }

  /**
   * Get all available test types
   */
  async getAllTestTypes() {
    try {
      const testTypes = this.sampleCollection.getAllTestTypes();
      
      return {
        success: true,
        data: testTypes
      };

    } catch (error) {
      console.error('Error getting test types:', error);
      throw ErrorHandler.handleError(error, 'Failed to get test types');
    }
  }

  /**
   * Calculate pricing for test types at a hospital
   */
  async calculatePricing(hospitalId, testTypeIds) {
    try {
      const hospital = this.db.prepare('SELECT * FROM hospitals WHERE id = ?').get(hospitalId);
      if (!hospital) {
        throw ErrorHandler.createError('Hospital not found', 404);
      }

      const pricing = this.sampleCollection.calculateEstimatedPrice(hospitalId, testTypeIds);
      const testDetails = this.sampleCollection.getHospitalTestTypes(hospitalId)
        .filter(test => testTypeIds.includes(test.id));

      return {
        success: true,
        data: {
          pricing,
          testDetails
        }
      };

    } catch (error) {
      console.error('Error calculating pricing:', error);
      throw ErrorHandler.handleError(error, 'Failed to calculate pricing');
    }
  }

  /**
   * Get hospitals that offer home sample collection
   */
  async getCollectionHospitals() {
    try {
      const query = `
        SELECT DISTINCT 
          h.*,
          COUNT(hts.id) as available_tests,
          CASE WHEN shp.id IS NOT NULL THEN 1 ELSE 0 END as has_rapid_pricing
        FROM hospitals h
        LEFT JOIN hospital_test_services hts ON h.id = hts.hospital_id AND hts.home_collection_available = 1 AND hts.is_available = 1
        LEFT JOIN simple_hospital_pricing shp ON h.id = shp.hospital_id AND shp.resource_type = 'rapid_collection'
        WHERE (hts.id IS NOT NULL OR shp.id IS NOT NULL)
        GROUP BY h.id
        ORDER BY h.name
      `;

      const hospitals = this.db.prepare(query).all();
      
      return {
        success: true,
        data: hospitals
      };

    } catch (error) {
      console.error('Error getting collection hospitals:', error);
      throw ErrorHandler.handleError(error, 'Failed to get hospitals offering collection services');
    }
  }

  /**
   * Get collection statistics for a hospital
   */
  async getHospitalStats(hospitalId) {
    try {
      const stats = this.sampleCollection.getHospitalStats(hospitalId);
      const agents = this.collectionAgent.getByHospitalId(hospitalId);
      
      return {
        success: true,
        data: {
          ...stats,
          totalAgents: agents.length,
          activeAgents: agents.filter(agent => agent.is_active).length
        }
      };

    } catch (error) {
      console.error('Error getting hospital stats:', error);
      throw ErrorHandler.handleError(error, 'Failed to get hospital statistics');
    }
  }

  /**
   * Helper method to get test details by IDs
   */
  getTestDetailsByIds(testIds) {
    if (!testIds || testIds.length === 0) return [];

    const placeholders = testIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM test_types 
      WHERE id IN (${placeholders}) AND is_active = 1
      ORDER BY name
    `);

    return stmt.all(...testIds);
  }

  /**
   * Cancel a collection request
   */
  async cancelRequest(requestId, userId, reason = '') {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      if (request.user_id !== userId) {
        throw ErrorHandler.createError('Access denied', 403);
      }

      if (request.status === 'completed') {
        throw ErrorHandler.createError('Cannot cancel completed request', 400);
      }

      const updated = this.sampleCollection.updateStatus(requestId, 'cancelled', {
        specialInstructions: reason ? `Cancelled: ${reason}` : 'Cancelled by user'
      });
      
      if (!updated) {
        throw ErrorHandler.createError('Failed to cancel request', 500);
      }

      return {
        success: true,
        message: 'Request cancelled successfully'
      };

    } catch (error) {
      console.error('Error cancelling request:', error);
      throw ErrorHandler.handleError(error, 'Failed to cancel request');
    }
  }

  /**
   * Get pending approval requests for a hospital
   */
  async getPendingApprovalRequests(hospitalId, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      const requests = this.sampleCollection.getPendingApprovalRequests(
        hospitalId,
        limit,
        offset
      );

      // Add test details for each request
      const enrichedRequests = requests.map(request => {
        const testDetails = this.getTestDetailsByIds(request.test_types || []);
        return {
          ...request,
          testDetails
        };
      });

      return {
        success: true,
        data: enrichedRequests,
        pagination: {
          page,
          limit,
          hasMore: requests.length === limit
        }
      };

    } catch (error) {
      console.error('Error getting pending approval requests:', error);
      throw ErrorHandler.handleError(error, 'Failed to get pending approval requests');
    }
  }

  /**
   * Approve a sample collection request
   */
  async approveRequest(requestId, approvedBy, hospitalId) {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      // Verify the request belongs to this hospital
      if (request.hospital_id !== hospitalId) {
        throw ErrorHandler.createError('Access denied. This request does not belong to your hospital.', 403);
      }

      // Check if already approved or rejected
      if (request.approval_status === 'approved') {
        throw ErrorHandler.createError('Request is already approved', 400);
      }

      if (request.approval_status === 'rejected') {
        throw ErrorHandler.createError('Cannot approve a rejected request', 400);
      }

      const approved = this.sampleCollection.approveRequest(requestId, approvedBy);
      
      if (!approved) {
        throw ErrorHandler.createError('Failed to approve request', 500);
      }

      // Auto-assign an available agent after approval
      const availableAgent = this.collectionAgent.getAvailableAgent(hospitalId);
      if (availableAgent) {
        this.sampleCollection.assignAgent(requestId, availableAgent.id);
      }

      const updatedRequest = this.sampleCollection.getRequestById(requestId);
      
      return {
        success: true,
        data: updatedRequest,
        message: availableAgent 
          ? `Request approved successfully. ${availableAgent.name} has been assigned.`
          : 'Request approved successfully. An agent will be assigned shortly.'
      };

    } catch (error) {
      console.error('Error approving request:', error);
      throw ErrorHandler.handleError(error, 'Failed to approve request');
    }
  }

  /**
   * Reject a sample collection request
   */
  async rejectRequest(requestId, rejectedBy, hospitalId, reason) {
    try {
      const request = this.sampleCollection.getRequestById(requestId);
      
      if (!request) {
        throw ErrorHandler.createError('Collection request not found', 404);
      }

      // Verify the request belongs to this hospital
      if (request.hospital_id !== hospitalId) {
        throw ErrorHandler.createError('Access denied. This request does not belong to your hospital.', 403);
      }

      // Check if already approved or rejected
      if (request.approval_status === 'approved') {
        throw ErrorHandler.createError('Cannot reject an approved request', 400);
      }

      if (request.approval_status === 'rejected') {
        throw ErrorHandler.createError('Request is already rejected', 400);
      }

      const rejected = this.sampleCollection.rejectRequest(requestId, rejectedBy, reason);
      
      if (!rejected) {
        throw ErrorHandler.createError('Failed to reject request', 500);
      }

      const updatedRequest = this.sampleCollection.getRequestById(requestId);
      
      return {
        success: true,
        data: updatedRequest,
        message: 'Request rejected successfully'
      };

    } catch (error) {
      console.error('Error rejecting request:', error);
      throw ErrorHandler.handleError(error, 'Failed to reject request');
    }
  }
}


module.exports = SampleCollectionService;