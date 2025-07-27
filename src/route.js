const contactController = require('./contact')
const userController = require('./user')
const staffController = require('./staff')
const noteController = require('./noteController')
const adminController = require('./adminController')
const { isAuthenticatedAdmin } = require('./adminMiddleware')
const { Video } = require('./mongodb')
// In your main app file (app.js or server.js)
const session = require('express-session');
const flash = require('connect-flash');

const isAuthenticatedstaff = (req, res, next) => {
    if (req.session && req.session.Staff) {
        return next();
    } else {
        res.redirect('/stafflogin');
    }
};

function routes(app) {
    // Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Flash middleware
app.use(flash());

// Make flash messages available to all views
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});
    // Staff routes
    app.get('/staff/update', isAuthenticatedstaff, staffController.staffUpdateView)
    app.get('/staff/upload', staffController.staffUploadView)
    app.get('/staff/view', isAuthenticatedstaff, staffController.staffViewCoursesView)
    app.get('/staff/update-book', staffController.staffUpdateView)
    app.get('/staff/upload-book', staffController.staffUploadView)
    app.get('/staff/view-book', staffController.staffViewCoursesView)
    app.put('/staff/update/:videoId', staffController.updateVideo)
    app.delete('/staff/delete/:videoId', staffController.deleteVideo);
    app.put('/staff/update-book/:bookId', staffController.updateBook)
    app.delete('/staff/delete-book/:bookId', staffController.deleteBook);

    // User routes
    app.post('/contact', contactController.contact)
    app.post('/signup', userController.signup)
    app.post('/login', userController.login)
    app.post('/forgotpassword', userController.forgotpassword)
    app.post('/resetpassword', userController.resetpassword)
    app.get('/resetpassword/:token', userController.resettoken)
    app.get('/verify/:token', userController.verifytoken)
    app.post('/authorize/:token', userController.authorizeUser);
    
    // Staff routes
    app.post('/staffsignup', staffController.staffsignup)
    app.post('/stafflogin', staffController.stafflogin)
    app.post('/staffforgotpassword', staffController.staffforgotpassword)
    app.post('/staffresetpassword', staffController.staffresetpassword)
    app.get('/staffresetpassword/:token', staffController.staffresettoken)
    app.get('/staffverify/:token', staffController.staffverifytoken)
    app.post('/staffauthorize/:token', staffController.authorizeStaff);


    // Video routes
    app.get('/api/videos', async (req, res) => {
        try {
            const videos = await Video.find().populate('teacherId', 'name');
            res.json(videos);
        } catch (error) {
            res.status(500).json({ error: 'Error fetching videos' });
        }
    })

    // Notes routes
    app.post('/api/notes', noteController.saveNote)
    app.get('/api/notes/:videoId', noteController.getNotes)
    app.delete('/api/notes/:noteId', noteController.deleteNote)

    // Admin routes
    app.get('/adminlogin', adminController.adminLoginView)
    app.post('/adminlogin', adminController.adminLogin)
    app.post('/admin/verify', adminController.verifyAdminCode)
    app.get('/admin/dashboard', isAuthenticatedAdmin, adminController.adminDashboard)
    app.get('/admin/users', isAuthenticatedAdmin, adminController.getUsers)
    app.get('/admin/staff', isAuthenticatedAdmin, adminController.getStaff)
    app.get('/admin/videos', isAuthenticatedAdmin, (req, res, next) => {
    adminController.getVideos(req, res, next);
});
app.get('/admin/books', isAuthenticatedAdmin, (req, res, next) => {
    adminController.getBooks(req, res, next);
});

    app.put('/admin/videos/:id/flag', isAuthenticatedAdmin, adminController.flagVideo);
    app.delete('/admin/videos/:id', isAuthenticatedAdmin,adminController.deleteVideo);
    app.put('/admin/books/:id/flag', isAuthenticatedAdmin, adminController.flagBook);
    app.delete('/admin/books/:id', isAuthenticatedAdmin,adminController.deleteBook);
    app.get('/admin/contacts', isAuthenticatedAdmin, adminController.getContacts)
    
    // Admin delete routes
    app.delete('/admin/users/:id', isAuthenticatedAdmin, adminController.deleteUser)
    app.delete('/admin/staff/:id', isAuthenticatedAdmin, adminController.deleteStaff)
    app.delete('/admin/videos/:id', isAuthenticatedAdmin, adminController.deleteVideo)
    app.delete('/admin/contacts/:id', isAuthenticatedAdmin, adminController.deleteContact)
    
    // Admin logout
    app.get('/admin/logout', adminController.adminLogout)
}

module.exports = routes