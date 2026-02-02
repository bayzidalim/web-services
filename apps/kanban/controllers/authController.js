const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        // Create new user
        const user = await User.create(email, password);
        res.status(201).json({ message: 'User created successfully', userId: user.id });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, userId: user.id, email: user.email });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};
