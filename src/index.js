require('dotenv').config()
const express = require("express");
const path = require("path");
const { User, Video, Contact, Staff, Book } = require("./mongodb");
const multer = require('multer');
// const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const flash = require('express-flash');
const e = require('express');

const port = 5000;
app.listen(port, () => {
    console.log(`Server listening on port ${ port }`)
});

app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.use(flash());

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.User) {
        return next();
    } else {
        res.redirect('/login');
    }
};

const isAuthenticatedstaff = (req, res, next) => {
    if (req.session && req.session.Staff) {
        return next();
    } else {
        res.redirect('/stafflogin');
    }
};

// FIXED: Corrected the authentication middleware syntax
const isAuthenticatedupload = (req, res, next) => {
    if (req.session && (req.session.Staff || req.session.User)) { // Added parentheses
        return next();
    } else {
        res.redirect('/index');
    }
};


// Static files
app.use(express.static("js"));
app.use(express.static("views"));
app.use('/css', express.static(path.join(__dirname, "./views/css")));
app.use(express.urlencoded({ extended: false }));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// app.use((req, res, next) => {
//     console.log(`${req.method} ${req.url} - User-Agent: ${req.get('User-Agent')}`);
//     next();
// });

// Use EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

// Routes
app.get("/", (req, res) => {
    res.render("index");
});

app.get("/index", (req, res) => {
    res.render("index");
});

// This route should display institute-specific courses for users
app.get("/upload", isAuthenticatedupload, async (req, res) => {
    try {
        // Check if user or staff is logged in
        const currentUser = req.session.User || req.session.Staff;
        
        if (!currentUser) {
            console.log('No user found in session');
            return res.redirect('/login');
        }

        console.log('Current user accessing upload:', currentUser.email, 'Institute:', currentUser.institute);

        // Check if user has institute field
        if (!currentUser.institute) {
            console.error('User has no institute:', currentUser.email);
            return res.render('upload', {
                videos: [],
          
                user: currentUser,
                error: 'No institute assigned to your account'
            });
        }

        // Filter videos by same institute
        const videos = await Video.find({})
            .populate({
                path: 'teacherId',
                select: 'sname institute email'
            })
            .sort({ uploadDate: -1 });

        console.log('All videos found:', videos.length);


        // Filter videos to only include those from teachers of the same institute
        const instituteVideos = videos.filter(video => 
            video.teacherId && 
            video.teacherId.institute && 
            video.teacherId.institute === currentUser.institute
        );

        console.log(`Found ${instituteVideos.length} videos from institute: ${currentUser.institute}`);
        console.log('About to render upload template');

        res.render('upload', {
            videos: instituteVideos,
            user: currentUser
        });

    } catch (error) {
        console.error('Error in /upload route:', error);
        res.status(500).render('error', {
            message: 'Error loading upload page',
            error: error
        });
    }
});
app.get("/books", isAuthenticatedupload, async (req, res) => {
    try {
        // Check if user or staff is logged in
        const currentUser = req.session.User || req.session.Staff;
        
        if (!currentUser) {
            console.log('No user found in session');
            return res.redirect('/login');
        }

        console.log('Current user accessing upload:', currentUser.email, 'Institute:', currentUser.institute);

        // Check if user has institute field
        if (!currentUser.institute) {
            console.error('User has no institute:', currentUser.email);
            return res.render('upload', {
               
                books: [],
                user: currentUser,
                error: 'No institute assigned to your account'
            });
        }

const books = await Book.find({})
            .populate({
                path: 'teacherId',
                select: 'sname institute email'
            })
            .sort({ uploadDate: -1 });


        const instituteBooks = books.filter(book => 
            book.teacherId && 
            book.teacherId.institute && 
            book.teacherId.institute === currentUser.institute
        );

        console.log(`Found ${instituteBooks.length} books from institute: ${currentUser.institute}`);
        console.log('About to render upload template');

        res.render('books', {
            books: instituteBooks,
            user: currentUser
        });

    } catch (error) {
        console.error('Error in /upload route:', error);
        res.status(500).render('error', {
            message: 'Error loading upload page',
            error: error
        });
    }
});
app.get("/about", (req, res) => {
    res.render("about");
});

// UPDATED: General courses route (shows all courses, not institute-specific)
app.get("/courses", async (req, res) => {
    try {
        const videos = await Video.find().populate('teacherId', 'sname institute');
        console.log('Found videos:', videos);
        
        // Get current user if logged in
        const currentUser = req.session.User || req.session.Staff || null;
        
        res.render("courses", { 
            videos,
            user: currentUser 
        });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.render("courses", { 
            videos: [],
            user: null 
        });
    }
});

app.get("/select", (req, res) => {
    res.render("select");
});

app.get("/student", isAuthenticated, (req, res) => {
    res.render("student");
});

app.get("/login", (req, res) => {
    res.render('login', {
        error: null,
        formSubmitted: false,
        email: '',
        messages: req.flash()
    });
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/resetpassword", (req, res) => {
    res.render("resetpassword");
});

app.get("/contact", (req, res) => {
    res.render("contact");
});

// Staff routes
app.get("/stafflogin", (req, res) => {
    res.render("stafflogin");
});

app.get("/staffsignup", (req, res) => {
    res.render("staffsignup");
});

app.get("/staffforgotpassword", (req, res) => {
    res.render("staffforgotpassword");
});

app.get("/staffresetpassword", (req, res) => {
    res.render("staffresetpassword");
});

app.get("/error", (req, res) => {
    res.render("error");
});

// FIXED: Staff upload route for uploading videos
app.get('/staffupload', isAuthenticatedstaff, (req, res) => {
    res.render('staffupload');
});

// Admin routes
app.get("/adminlogin", (req, res) => {
    res.render("adminLogin", { 
        error: req.flash('error'),
        success: req.flash('success')
    });
});

// Include all other routes
require('./route')(app)

// Multer configuration
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: function(req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static('uploads', { headers: { 'Content-Type': 'video/mp4' } }));

// Handle video upload (POST request)
app.post('/upload', upload.single('video'), (req, res) => {
    try {
        // Check if file is uploaded
        if (!req.file) {
            return res.json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }

        const { videoName, videoDescription } = req.body;
        const filename = req.file.filename;

        // Check for empty fields
        if (!filename || !videoName || !videoDescription) {
            return res.json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Get the logged-in staff member's ID from the session
        const teacherId = req.session.Staff;
        if (!teacherId) {
            return res.json({ 
                success: false, 
                message: 'You must be logged in as staff to upload videos' 
            });
        }

        const newVideo = new Video({
            title: videoName,
            description: videoDescription,
            filename,
            teacherId
        });

        newVideo.save()
            .then(video => {
                res.json({ 
                    success: true, 
                    message: 'Video uploaded successfully!',
                    data: video 
                });
            })
            .catch(error => {
                console.error('Error saving video to database:', error);
                res.json({ 
                    success: false, 
                    message: 'Database error occurred while saving video' 
                });
            });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.json({ 
            success: false, 
            message: 'Server error occurred during upload' 
        });
    }
});
app.post('/upload-book', upload.single('book'), (req, res) => {
    try {
        console.log('Processing book upload:', req.body, req.file);
        
        // Check if file is uploaded
        if (!req.file) {
            req.flash('error', 'No file uploaded');
            return res.redirect('/staffupload');
        }

        let { title, description, subject, author, type } = req.body;
type = (type || '').trim().toLowerCase(); // Normalize
console.log('Normalized type:', type);

        const filename = req.file.filename;
        console.log('Uploaded file:', filename);
        // Check for empty fields
        if (!filename || !title || !description) {
            console.log('Required fields are missing:', { filename, title, description });
            req.flash('error', 'Required all fields');
            return res.redirect('/staffupload');
        }

        // Get the logged-in staff member's ID from the session
        const teacherId = req.session.Staff;
        if (!teacherId) {
            req.flash('error', 'You must be logged in as staff to upload videos');
            console.log('Staff not logged in');
            return res.redirect('/stafflogin');
        }
        if (!['notebook', 'textbook'].includes(type)) {
            console.error('Invalid type provided:', type);
    req.flash('error', 'Invalid type provided');
    return res.redirect('/staffupload');
}
console.log('Creating new book object with:', {
            title, description, subject, author, type, filename, teacherId
        });

        const newBook = new Book({
            title: title,
            description: description,
            subject: subject,
            author: author,
            type: type,
            filename,
            teacherId
        });
        console.log('New book object:', newBook);
        newBook.save()
            .then(book => {
                res.json(book);
            })
            .catch(error => {
    console.error('Error saving book to database:', error.message);
    if (error.name === 'ValidationError') {
        for (field in error.errors) {
            console.error('Validation error -', field, ':', error.errors[field].message);
        }
    }
    req.flash('error', 'Error saving book');
    res.redirect('/staffupload');
});

    } catch (error) {
        console.log('Error processing upload:', error);
        console.error('Error processing upload:', error);
        res.render("error");
    }
});
app.get('/videos', (req, res) => {
    Video.find({})
        .exec()
        .then(videos => {
            res.render("videos");
        })
        .catch(error => {
            console.error('Error retrieving videos from database:', error);
            res.render("error");
        });
});

// API endpoint to get video data as JSON
app.get('/api/videos', (req, res) => {
    Video.find({teacherId: req.session.Staff})
        .populate('teacherId', 'sname') // Populate teacher name from Staff model
        .exec()
        .then(videos => {
            console.log('API returned videos:', videos); // Debug log
            res.json(videos);
        })
        .catch(error => {
            console.error('Error retrieving videos from database:', error);
            res.status(500).json({ error: 'Error fetching videos' });
        });
});

app.get('/api/books', async (req, res) => {
    try {
        console.log('Fetching books for user:', req.session.Staff);
        const books = await Book.find({ teacherId: req.session.Staff })
            .populate('teacherId', 'sname')
            .sort({ createdAt: -1 });
        res.json(books);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// API endpoint to get video file size
app.get('/api/video-filesize/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const fs = require('fs');
        const path = require('path');
        
        const filePath = path.join(__dirname, 'uploads', filename); // Adjust path as needed
        
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            res.json({ 
                success: true, 
                fileSize: stats.size 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'File not found' 
            });
        }
    } catch (error) {
        console.error('Error getting video file size:', error);
        res.json({ 
            success: false, 
            message: 'Error reading file' 
        });
    }
});

// API endpoint to get book file size
app.get('/api/book-filesize/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const fs = require('fs');
        const path = require('path');
        
        const filePath = path.join(__dirname, 'uploads', filename); // Adjust path as needed
        
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            res.json({ 
                success: true, 
                fileSize: stats.size 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'File not found' 
            });
        }
    } catch (error) {
        console.error('Error getting book file size:', error);
        res.json({ 
            success: false, 
            message: 'Error reading file' 
        });
    }
});

// API endpoint to get PDF page count
app.get('/api/book-pagecount/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const fs = require('fs');
        const path = require('path');
        const pdf = require('pdf-parse'); 
        
        const filePath = path.join(__dirname, 'uploads', filename); // Adjust path as needed
        
        if (fs.existsSync(filePath)) {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            
            res.json({ 
                success: true, 
                pageCount: data.numpages 
            });
        } else {
            res.json({ 
                success: false, 
                message: 'File not found' 
            });
        }
    } catch (error) {
        console.error('Error getting PDF page count:', error);
        res.json({ 
            success: false, 
            message: 'Error reading PDF' 
        });
    }
});