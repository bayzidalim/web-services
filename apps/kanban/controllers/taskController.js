const Task = require('../models/Task');

exports.getTasks = async (req, res, next) => {
    try {
        const tasks = await Task.findByUserId(req.userId);
        res.json(tasks);
    } catch (error) {
        next(error);
    }
};

exports.createTask = async (req, res, next) => {
    try {
        const { title, description, dueDate, priority } = req.body;
        
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Task title is required' });
        }

        const task = await Task.create(req.userId, { 
            title: title.trim(), 
            description: description ? description.trim() : null, 
            dueDate, 
            priority: priority || 'low'
        });
        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
};

exports.updateTask = async (req, res) => {
    try {
        const taskId = req.params.id;
        const updates = req.body;

        // First check if task exists and belongs to user
        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (existingTask.user_id !== req.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updatedTask = await Task.update(taskId, updates);
        res.json(updatedTask);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const taskId = req.params.id;

        // First check if task exists and belongs to user
        const existingTask = await Task.findById(taskId);
        if (!existingTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (existingTask.user_id !== req.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await Task.delete(taskId);
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
};
