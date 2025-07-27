const { User, Video, Contact, Staff, Book } = require('./mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

// Admin credentials from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nadigersankalp@gmail.com';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Avishkar@12';

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Store verification codes temporarily (in production, use Redis or database)
const verificationCodes = new Map();

const adminController = {
    // Show admin login page
    adminLoginView: (req, res) => {
        res.render('adminlogin', { 
            error: req.flash('error'),
            success: req.flash('success')
        });
    },

    // Handle admin login and send verification code
    adminLogin: async (req, res) => {
        try {
            const { username, email } = req.body;

            // Validate admin credentials
            if (username !== ADMIN_USERNAME || email !== ADMIN_EMAIL) {
                req.flash('error', 'Invalid admin credentials');
                return res.redirect('/adminlogin');
            }

            // Generate 6-digit verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Store verification code with expiry (5 minutes)
            const codeData = {
                code: verificationCode,
                email: email,
                username: username,
                expiry: Date.now() + 5 * 60 * 1000 // 5 minutes
            };
            verificationCodes.set(email, codeData);

            // Send verification code via email
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Admin Login Verification Code',
                html: `
                    <h2>Admin Login Verification</h2>
                    <p>Your verification code is: <strong>${verificationCode}</strong></p>
                    <p>This code will expire in 5 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                `
            };

            await transporter.sendMail(mailOptions);
            
            req.flash('success', 'Verification code sent to your email');
            res.render('adminverification', { email: email });

        } catch (error) {
            console.error('Error sending verification code:', error);
            req.flash('error', 'Error sending verification code');
            res.redirect('/adminlogin');
        }
    },

    // Verify admin code and login
    verifyAdminCode: (req, res) => {
        try {
            const { email, code } = req.body;
            
            const storedData = verificationCodes.get(email);
            
            if (!storedData) {
                req.flash('error', 'Verification code expired or invalid');
                return res.redirect('/adminlogin');
            }

            // Check if code is expired
            if (Date.now() > storedData.expiry) {
                verificationCodes.delete(email);
                req.flash('error', 'Verification code expired');
                return res.redirect('/adminlogin');
            }

            // Check if code matches
            if (storedData.code !== code) {
                req.flash('error', 'Invalid verification code');
                return res.render('adminverification', { 
                    email: email,
                    error: 'Invalid verification code'
                });
            }

            // Code is valid, create admin session
            req.session.Admin = {
                username: storedData.username,
                email: storedData.email,
                isAdmin: true
            };

            // Clean up verification code
            verificationCodes.delete(email);
            
            res.redirect('/admin/dashboard');

        } catch (error) {
            console.error('Error verifying admin code:', error);
            req.flash('error', 'Error verifying code');
            res.redirect('/adminlogin');
        }
    },

    // Admin dashboard
    adminDashboard: async (req, res) => {
        try {
            // Get statistics
            const totalUsers = await User.countDocuments();
            const totalStaff = await Staff.countDocuments();
            const totalVideos = await Video.countDocuments();
            const totalContacts = await Contact.countDocuments();

            // Get users by institute
            const usersByInstitute = await User.aggregate([
                { $group: { _id: '$institute', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            // Get staff by institute
            const staffByInstitute = await Staff.aggregate([
                { $group: { _id: '$institute', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            // Get recent registrations
            const recentUsers = await User.find().sort({ _id: -1 }).limit(5);
            const recentStaff = await Staff.find().sort({ _id: -1 }).limit(5);

            res.render('admindashboard', {
                admin: req.session.Admin,
                stats: {
                    totalUsers,
                    totalStaff,
                    totalVideos,
                    totalContacts
                },
                usersByInstitute,
                staffByInstitute,
                recentUsers,
                recentStaff
            });

        } catch (error) {
            console.error('Error loading admin dashboard:', error);
            res.render('error', { message: 'Error loading dashboard' });
        }
    },

    // Get all users with filtering
   getUsers: async (req, res) => {
    try {
        const { institute, verified, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        
        // Institute filter
        if (institute && institute !== 'all') {
            filter.institute = institute;
        }
        
        // Verification status filter
        if (verified && verified !== 'all') {
            filter.isVerified = verified === 'true';
        }

        // Get users with pagination
        const users = await User.find(filter)
            .sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // Convert to plain JavaScript objects

        const total = await User.countDocuments(filter);
        const institutes = await User.distinct('institute');

        // Calculate verification counts for UI
        const verifiedCount = await User.countDocuments({ ...filter, isVerified: true });
        const unverifiedCount = await User.countDocuments({ ...filter, isVerified: false });

        // Prepare user data with additional flags
        const usersWithFlags = users.map(user => ({
            ...user,
            rowClass: user.isVerified ? '' : 'unverified-row'
        }));

        res.render('adminusers', {
            users: usersWithFlags,
            institutes,
            currentFilter: { 
                institute: institute || 'all', 
                verified: verified || 'all' 
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                verifiedCount,
                unverifiedCount
            },
            // Initialize hiddenCount to 0 (will be updated client-side)
            hiddenCount: 0
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.render('error', { message: 'Error fetching users' });
    }
},

    // Get all staff with filtering
    getStaff: async (req, res) => {
    try {
        const { institute, verified, page = 1, limit = 10 } = req.query;
        
        let filter = {};
        
        // Institute filter
        if (institute && institute !== 'all') {
            filter.institute = institute;
        }
        
        // Verification status filter
        if (verified && verified !== 'all') {
            filter.isVerified = verified === 'true';
        }

        // Get staff with pagination
        const staff = await Staff.find(filter)
            .sort({ _id: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean(); // Convert to plain JavaScript objects

        const total = await Staff.countDocuments(filter);
        const institutes = await Staff.distinct('institute');

        // Calculate verification counts for UI
        const verifiedCount = await Staff.countDocuments({ ...filter, isVerified: true });
        const unverifiedCount = await Staff.countDocuments({ ...filter, isVerified: false });

        // Prepare staff data with additional flags
        const staffWithFlags = staff.map(member => ({
            ...member,
            // Add any additional flags or computed properties here
            // For example, you could add a hidden flag if you store that in the database
            // hidden: member.hidden || false
        }));

        res.render('adminstaff', {
            staff: staffWithFlags,
            institutes,
            currentFilter: { 
                institute: institute || 'all', 
                verified: verified || 'all' 
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                verifiedCount,
                unverifiedCount
            },
            // Initialize hiddenCount to 0 (will be updated client-side)
            hiddenCount: 0
        });

    } catch (error) {
        console.error('Error fetching staff:', error);
        res.render('error', { message: 'Error fetching staff' });
    }
},
getBooks: async (req, res) => {
  try {
    const { institute = 'all', teacher = 'all', type = 'all', page = 1, limit = 10 } = req.query;
    
    // 1. First match books by teacher if specified
    let bookMatch = {};
    if (teacher !== 'all') {
      bookMatch.teacherId = new mongoose.Types.ObjectId(teacher);
    }
    if (type !== 'all') {
      bookMatch.type = type;
    }

    // 2. Aggregation pipeline
    const pipeline = [
      { $match: bookMatch },
      {
        $lookup: {
          from: 'staffs',
          localField: 'teacherId',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      {
        $unwind: {
          path: '$teacherInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          ...(institute !== 'all' && {
            $or: [
              { 'teacherInfo.institute': institute },
              { teacherInfo: { $exists: false } },
              { 'teacherInfo.institute': { $exists: false } }
            ]
          })
        }
      },
      {
        $addFields: {
          // Create teacherId object that matches frontend expectations
          teacherId: {
            _id: { $ifNull: ['$teacherInfo._id', '$teacherId'] },
            sname: { $ifNull: ['$teacherInfo.sname', 'Unknown Teacher'] },
            institute: { $ifNull: ['$teacherInfo.institute', 'No Institute'] }
          }
        }
      },
      {
        $project: {
          title: 1,
          description: 1,
          subject: 1,
          author: 1,
          type: 1,
          filename: 1,
          uploadDate: 1,
          isFlagged: 1,
          teacherId: 1 // This will now include the restructured teacherId
        }
      },
      { $sort: { uploadDate: -1 } },
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];

    const books = await Book.aggregate(pipeline);

    // Get counts (modified to match the same filters)
    const countPipeline = [
      { $match: bookMatch },
      {
        $lookup: {
          from: 'staffs',
          localField: 'teacherId',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      { $unwind: { path: '$teacherInfo', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(institute !== 'all' && {
            $or: [
              { 'teacherInfo.institute': institute },
              { teacherInfo: { $exists: false } },
              { 'teacherInfo.institute': { $exists: false } }
            ]
          })
        }
      },
      { $count: "total" }
    ];

    const totalResult = await Book.aggregate(countPipeline);
    const totalBooks = totalResult[0]?.total || 0;

    // Get filter options
    const [institutes, teachers, bookTypes] = await Promise.all([
      Staff.distinct('institute'),
      Staff.find({}, { sname: 1, institute: 1 }),
      Book.distinct('type') // Get unique book types
    ]);

    res.render('adminbooks', {
      books,
      institutes,
      teachers,
      bookTypes,
      currentFilter: { institute, teacher, type },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalBooks,
        pages: Math.ceil(totalBooks / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching books:', error);
    res.render('error', { message: 'Error fetching books' });
  }
},

    // Get all videos with filtering
   getVideos: async (req, res) => {
  try {
    const { institute = 'all', teacher = 'all', page = 1, limit = 10 } = req.query;
    
    // 1. First match videos by teacher if specified
    let videoMatch = {};
    if (teacher !== 'all') {
      videoMatch.teacherId = new mongoose.Types.ObjectId(teacher);
    }

    // 2. Aggregation pipeline
    const pipeline = [
      { $match: videoMatch },
      {
        $lookup: {
          from: 'staffs',
          localField: 'teacherId',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      {
        $unwind: {
          path: '$teacherInfo',
          preserveNullAndEmptyArrays: true // This is key for missing teachers
        }
      },
      {
        $match: {
          // Only apply institute filter if not 'all' AND teacherInfo exists
          ...(institute !== 'all' && {
            $or: [
              { 'teacherInfo.institute': institute },
              { teacherInfo: { $exists: false } }, // Include videos without teacher info
              { 'teacherInfo.institute': { $exists: false } } // Include if institute field missing
            ]
          })
        }
      },
      {
        $project: {
          title: 1,
          videoName: 1, // Include videoName as fallback for title
          description: 1, // ADD THIS LINE - Missing description field
          filename: 1,
          uploadDate: 1,
          isFlagged: 1,
          teacherId: {
            _id: '$teacherInfo._id',
            sname: { $ifNull: ['$teacherInfo.sname', 'Unknown Teacher'] },
            institute: { $ifNull: ['$teacherInfo.institute', 'No Institute'] }
          }
        }
      },
      { $sort: { uploadDate: -1 } },
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];

    const videos = await Video.aggregate(pipeline);

    // Get counts (modified to match the same filters)
    const countPipeline = [
      { $match: videoMatch },
      {
        $lookup: {
          from: 'staff',
          localField: 'teacherId',
          foreignField: '_id',
          as: 'teacherInfo'
        }
      },
      { $unwind: { path: '$teacherInfo', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(institute !== 'all' && {
            $or: [
              { 'teacherInfo.institute': institute },
              { teacherInfo: { $exists: false } },
              { 'teacherInfo.institute': { $exists: false } }
            ]
          })
        }
      },
      { $count: "total" }
    ];

    const totalResult = await Video.aggregate(countPipeline);
    const totalVideos = totalResult[0]?.total || 0;

    // Get filter options
    const [institutes, teachers] = await Promise.all([
      Staff.distinct('institute'),
      Staff.find({}, { sname: 1, institute: 1 })
    ]);

    res.render('adminvideos', {
      videos,
      institutes,
      teachers,
      currentFilter: { institute, teacher },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalVideos,
        pages: Math.ceil(totalVideos / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching videos:', error);
    res.render('error', { message: 'Error fetching videos' });
  }
},

flagBook: async (req, res) => {
    try {
        const { id } = req.params;
        const { isFlagged } = req.body;

        const book = await Book.findByIdAndUpdate(
            id,
            { isFlagged },
            { new: true }
        );

        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        res.json({ success: true, book });
    } catch (error) {
        console.error('Error flagging book:', error);
        res.status(500).json({ success: false, message: 'Error updating book status' });
    }
},
// Flag/unflag a video
flagVideo: async (req, res) => {
    try {
        const { id } = req.params;
        const { isFlagged } = req.body;
        
        const video = await Video.findByIdAndUpdate(
            id, 
            { isFlagged }, 
            { new: true }
        );
        
        if (!video) {
            return res.status(404).json({ success: false, message: 'Video not found' });
        }
        
        res.json({ success: true, video });
    } catch (error) {
        console.error('Error flagging video:', error);
        res.status(500).json({ success: false, message: 'Error updating video status' });
    }
},

deleteBook: async (req, res) => {
    try {
        const { id } = req.params;
        
        const book = await Book.findByIdAndDelete(id);
        
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }
        
        // Add code here to actually delete the book file from storage
        // fs.unlinkSync(path.join(uploadsPath, book.filename));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting book:', error);
        res.status(500).json({ success: false, message: 'Error deleting book' });
    }
},
// Delete a video
deleteVideo: async (req, res) => {
    try {
        const { id } = req.params;
        
        const video = await Video.findByIdAndDelete(id);
        
        if (!video) {
            return res.status(404).json({ success: false, message: 'Video not found' });
        }
        
        // Add code here to actually delete the video file from storage
        // fs.unlinkSync(path.join(uploadsPath, video.filename));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ success: false, message: 'Error deleting video' });
    }
},

    // Get all contacts
    getContacts: async (req, res) => {
        try {
            const { page = 1, limit = 10 } = req.query;

            const contacts = await Contact.find()
                .sort({ _id: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);

            const total = await Contact.countDocuments();

            res.render('admincontacts', {
                contacts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('Error fetching contacts:', error);
            res.render('error', { message: 'Error fetching contacts' });
        }
    },

    // Delete user
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            await User.findByIdAndDelete(id);
            res.json({ success: true, message: 'User deleted successfully' });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ success: false, message: 'Error deleting user' });
        }
    },

    // Delete staff
    deleteStaff: async (req, res) => {
        try {
            const { id } = req.params;
            
            // Also delete all videos by this staff member
            await Video.deleteMany({ teacherId: id });
            await Staff.findByIdAndDelete(id);
            
            res.json({ success: true, message: 'Staff and their videos deleted successfully' });
        } catch (error) {
            console.error('Error deleting staff:', error);
            res.status(500).json({ success: false, message: 'Error deleting staff' });
        }
    },

    // Delete video
    deleteVideo: async (req, res) => {
        try {
            const { id } = req.params;
            const fs = require('fs');
            const path = require('path');
            
            // Get video details to delete file
            const video = await Video.findById(id);
            if (video && video.filename) {
                const filePath = path.join(__dirname, 'uploads', video.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            
            await Video.findByIdAndDelete(id);
            res.json({ success: true, message: 'Video deleted successfully' });
        } catch (error) {
            console.error('Error deleting video:', error);
            res.status(500).json({ success: false, message: 'Error deleting video' });
        }
    },

    // Delete contact
    deleteContact: async (req, res) => {
        try {
            const { id } = req.params;
            await Contact.findByIdAndDelete(id);
            res.json({ success: true, message: 'Contact deleted successfully' });
        } catch (error) {
            console.error('Error deleting contact:', error);
            res.status(500).json({ success: false, message: 'Error deleting contact' });
        }
    },

    // Admin logout
    adminLogout: (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            res.redirect('/adminlogin');
        });
    }
};

module.exports = adminController;