require('dotenv').config()
const express = require("express");
const path = require("path");
const { User, Video, Contact, Staff, Book } = require("./mongodb");
const multer = require('multer');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const flash = require('express-flash');
const transporter = require("./middleware")

const staffController = {
    // Staff course management routes
    async staffUpdateView(req, res) {
    try {
        const staffId = req.session.Staff;
        const videos = await Video.find({ teacherId: staffId });
        const books= await Book.find({ teacherId: staffId });
        console.log('Videos for staff:', videos);
        console.log('Books for staff:', books);
        res.render('staffupdate', { videos, books });
    } catch (error) {
        console.error(error);
        res.render("error");
    }},
    
    async staffUploadView(req, res) {
        try {
            res.render('staffupload');
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },

    async staffViewCoursesView(req, res) {
    try {
        // Fetch videos with teacher information populated
        const videos = await Video.find({ teacherId: req.session.Staff }) // assuming you have user authentication
            .populate('teacherId', 'sname') // populate teacher name
            .sort({ createdAt: -1 }); // newest first by default
        
        // Fetch books with teacher information populated
        const books = await Book.find({ teacherId: req.session.Staff })
            .populate('teacherId', 'sname')
            .sort({ createdAt: -1 });
        
        // Render the view page with both videos and books
        res.render('staffview', {
            videos: videos,
            books: books,
            title: 'View Content'
        });
        
    } catch (error) {
        console.error('Error fetching content:', error);
        res.status(500).render('error', {
            message: 'Error loading content',
            error: error
        });
    }
},

    async updateVideo(req, res) {
        try {
            const { videoId } = req.params;
            const { videoName, videoDescription } = req.body;
            
            const video = await Video.findById(videoId);
            if (!video) {
                return res.status(404).json({ error: 'Video not found' });
            }

            video.title = videoName;
            video.description = videoDescription;
            await video.save();

            res.json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Server error' });
        }
    },
async deleteVideo(req, res) {
    try {
        const { videoId } = req.params;
        
        // Find the video first to get file information
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Store filename for file deletion
        const filename = video.filename;
        
        // Delete video from database
        await Video.findByIdAndDelete(videoId);
        
        // Delete physical file from server (optional - uncomment if you want to delete files)
        /*
        if (filename) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../uploads', filename); // Adjust path as needed
            
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                } else {
                    console.log('File deleted successfully:', filename);
                }
            });
        }
        */
        
        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Server error while deleting video' });
    }
},
 async updateBook(req, res) {
    try {
        const { bookId } = req.params;
        const { title, description, author, subject, type } = req.body;

        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        // Update all the fields that the frontend is sending
        if (title !== undefined) book.title = title;
        if (description !== undefined) book.description = description;
        if (author !== undefined) book.author = author;
        if (subject !== undefined) book.subject = subject;
        if (type !== undefined) book.type = type;

        await book.save();

        res.json({ success: true, message: 'Book updated successfully' });
    } catch (error) {
        console.error('Error updating book:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
},
async deleteBook(req, res) {
    try {
        const { bookId } = req.params;

        // Find the book first to get file information
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        
        // Store filename for file deletion
        const filename = book.filename;

        // Delete book from database
        await Book.findByIdAndDelete(bookId);
        
        // Delete physical file from server (optional - uncomment if you want to delete files)
        /*
        if (filename) {
            const fs = require('fs');
            const path = require('path');
            const filePath = path.join(__dirname, '../uploads', filename); // Adjust path as needed
            
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                } else {
                    console.log('File deleted successfully:', filename);
                }
            });
        }
        */
        
        res.json({ success: true, message: 'Book deleted successfully' });
    } catch (error) {
        console.error('Delete book error:', error);
        res.status(500).json({ error: 'Server error while deleting book' });
    }
},
    async staffsignup(req, res) {
        try {
            const { sname, semail, institute, spassword } = req.body;
            if (sname === '' || semail === '' || spassword === '') {
                req.flash('error', 'Data Field is empty');
                return res.redirect('/stafflogin'); // Replace with the appropriate form page
            }
            const existingStaff = await Staff.findOne({ semail });
            // const emailRegex = /^[^\s@]+@vvce\.ac\.in$/; //example@lms.ac.in
            // if (!emailRegex.test(semail)) {
            //     res.send('<script>alert("You are not authorized."); window.location.href="/stafflogin";</script>');
            // }


            if (existingStaff) {
                res.send('<script>alert("User is already registered."); window.location.href="/stafflogin";</script>');
            }
            const hashedPassword = await bcrypt.hash(spassword, 10);

            const staff = new Staff({
                sname,
                semail,
                spassword: hashedPassword,
                institute, // Added institute field
                isVerified: false,
            });

            await staff.save();

            // Send verification email
            const verificationToken = uuid.v4();
            staff.resetToken = verificationToken;
            staff.resetTokenExpiry = Date.now() + 3600000; // Token expires in 1 hour
            await staff.save();
 const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Staff Verification Request</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    background-color: #f4f4f4;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .header {
                    background: #007bff;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 10px 10px 0 0;
                    margin: -20px -20px 20px -20px;
                }
                .user-details {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 20px 0;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 10px 0;
                    padding: 8px 0;
                    border-bottom: 1px solid #dee2e6;
                }
                .detail-label {
                    font-weight: bold;
                    color: #495057;
                }
                .detail-value {
                    color: #6c757d;
                }
                .btn-container {
                    text-align: center;
                    margin: 30px 0;
                }
                .verify-btn {
                    background: #28a745;
                    color: white;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    display: inline-block;
                }
                .verify-btn:hover {
                    background: #218838;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #dee2e6;
                    color: #6c757d;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>🎓 New Staff Registration Request</h2>
                    <p>LMS Project - Staff Verification</p>
                </div>
                
                <h3>A new staff has registered and requires verification:</h3>
                
                <div class="user-details">
                    <div class="detail-row">
                        <span class="detail-label">👤 Name: </span>
                        <span class="detail-value">${sname}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">📧 Email: </span>
                        <span class="detail-value">${semail}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">🏫 Institute: </span>
                        <span class="detail-value">${institute}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">📅 Registration Date: </span>
                        <span class="detail-value">${new Date().toLocaleString()}</span>
                    </div>
                </div>

                <p><strong>Please review the staff details above and click the button below to authorize this registration:</strong></p>

                <div class="btn-container">
                    <a href="http://localhost:5000/verify/${verificationToken}" class="verify-btn">
                        ✅ AUTHORIZE STAFF
                    </a>
                </div>
                
                <div class="footer">
                    <p>This verification link will expire in 1 hour.</p>
                    <p>If you did not expect this registration request, please ignore this email.</p>
                    <p>© 2025 LMS Project. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
            const mailOptions = {
            from: process.env.ADMIN_EMAIL,
            to: process.env.INSTRUCTOR_EMAIL,
            subject: '🎓 New Staff Registration - Verification Required',
            html: htmlContent,
            // Fallback text version
            text: `
                New Staff Registration Request
                
                User Details:
                Name: ${sname}
                Email: ${semail}
                Institute: ${institute}
                Registration Date: ${new Date().toLocaleString()}

                Please verify this staff by clicking the following link:
                http://localhost:5000/staffverify/${verificationToken}
                
                This link will expire in 1 hour.
            `
        };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error(error);
                    res.render('error');
                } else {
                    console.log('Email sent: ' + info.response);

                    res.send('<script>alert("Staff registered successfully. Verification email sent."); window.location.href="/stafflogin";</script>');

                }
            });
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },
async declineStaff(req, res) {
    try {
        const { token } = req.params;

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() },
        });

        if (!user) {
            req.flash('error', 'Invalid or expired verification token.');
            return res.redirect('/login');
        }

        // Send rejection email to user
        const rejectionMailOptions = {
            from: process.env.ADMIN_EMAIL,
            to: user.email,
            subject: '❌ Registration Application Declined - LMS Project',
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h2>Registration Application Declined</h2>
                </div>
                <div style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px;">
                    <p>Dear ${user.name},</p>
                    <p>We regret to inform you that your registration application for the LMS Project has been declined.</p>
                    <p>If you believe this is an error or have questions, please contact the administrator.</p>
                    <p>Best regards,<br>The LMS Team</p>
                </div>
            </div>
            `
        };

        transporter.sendMail(rejectionMailOptions);

        // Delete the user record since they were declined
        await User.findByIdAndDelete(user._id);

        req.flash('success', `User registration for ${user.name} has been declined.`);
        return res.redirect('/admin/dashboard');
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred during decline process');
        return res.redirect('/error');
    }
},
// Route to handle the actual authorization
async authorizeStaff(req, res) {
    try {
        console.log('Authorizing user with params:', req.params);
        const { token } = req.params; // Changed from { token, id } to single parameter

        let staff;
        
        // First try to find by token (if it looks like a token)
        if (token && token.length > 20) { // Assuming tokens are longer than 20 chars
            staff = await Staff.findOne({
                resetToken: token,
                resetTokenExpiry: { $gt: Date.now() },
            });
        }

        // If not found by token or parameter is shorter (likely an ID)
        if (!staff) {
            try {
                staff = await Staff.findById(token);
            } catch (err) {
                // If ID format is invalid
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid verification token or staff ID'
                });
            }
        }

        if (!staff) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid verification token or staff ID'
            });
        }

        // Check if already verified
        if (staff.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Staff is already verified'
            });
        }

        staff.isVerified = true;
        staff.resetToken = undefined;
        staff.resetTokenExpiry = undefined;

        await staff.save();

        // Send confirmation email to the staff
        const confirmationMailOptions = {
            from: process.env.ADMIN_EMAIL,
            to: staff.semail,
            subject: '🎉 Account Verified Successfully - LMS Project',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Account Verified</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        margin: 0;
                        padding: 20px;
                        background-color: #f4f4f4;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: #28a745;
                        color: white;
                        padding: 20px;
                        text-align: center;
                        border-radius: 10px 10px 0 0;
                        margin: -20px -20px 20px -20px;
                    }
                    .success-icon {
                        font-size: 48px;
                        margin-bottom: 10px;
                    }
                    .btn-container {
                        text-align: center;
                        margin: 30px 0;
                    }
                    .login-btn {
                        background: #007bff;
                        color: white;
                        padding: 12px 30px;
                        text-decoration: none;
                        border-radius: 5px;
                        font-weight: bold;
                        display: inline-block;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="success-icon">🎉</div>
                        <h2>Account Verified Successfully!</h2>
                    </div>

                    <p>Dear ${staff.sname},</p>

                    <p>Congratulations! Your account has been successfully verified by our administrator.</p>
                    
                    <p><strong>Account Details:</strong></p>
                    <ul>
                        <li><strong>Name:</strong> ${staff.sname}</li>
                        <li><strong>Email:</strong> ${staff.semail}</li>
                        <li><strong>Institute:</strong> ${staff.institute}</li>
                    </ul>
                    
                    <p>You can now log in to your account and start using the LMS platform.</p>
                    
                    <div class="btn-container">
                        <a href="http://localhost:5000/stafflogin" class="login-btn">
                            🚀 LOGIN NOW
                        </a>
                    </div>

                    <p>Welcome to Grad.LMS!</p>

                    <p>Best regards,<br>The Grad.LMS Team</p>
                </div>
            </body>
            </html>
            `,
            text: `
                Account Verified Successfully!

                Dear ${staff.sname},

                Your account has been successfully verified. You can now log in at:
                http://localhost:3000/login
                
                Account Details:
                - Name: ${staff.sname}
                - Email: ${staff.semail}
                - Institute: ${staff.institute}

                Welcome to the LMS Project!
            `
        };

        transporter.sendMail(confirmationMailOptions, (error, info) => {
            if (error) {
                console.error('Error sending confirmation email:', error);
            } else {
                console.log('Confirmation email sent: ' + info.response);
            }
        });

        return res.json({ 
            success: true,
            message: `Staff ${staff.sname} has been successfully verified and notified.`,
            staff: {
                id: staff._id,
                name: staff.sname,
                email: staff.semail,
                isVerified: staff.isVerified
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ 
            success: false,
            message: 'An error occurred during authorization'
        });
    }
},
    async stafflogin(req, res) {
    try {
        const { semail, spassword } = req.body;

        if (!semail || !spassword) {
            req.flash('error', 'All fields are required');
            return res.redirect('/stafflogin');
        }

        const staff = await Staff.findOne({ semail });
        if (!staff) {
            req.flash('error', 'User not found');
            return res.redirect('/stafflogin');
        }

        const isPasswordValid = await bcrypt.compare(spassword, staff.spassword);
        if (!isPasswordValid) {
            req.flash('error', 'Invalid password');
            return res.redirect('/stafflogin');
        }

        //Optional: Check for verification
        if (!staff.isVerified) {
            req.flash('error', 'Account not verified');
            return res.redirect('/stafflogin');
        }

        // Store only staff ID in session
        req.session.Staff = staff._id;
        res.render("staffupload");

    } catch (error) {
        console.error(error);
        res.render("error");
    }
},


    // Handle forgot password
    async staffforgotpassword(req, res) {
        try {
            const { semail } = req.body;

            const staff = await Staff.findOne({ semail });

            if (!staff) {
                req.flash('error', 'User not found');
                return res.redirect('/stafflogin');
            }

            const resetToken = uuid.v4();
            staff.resetToken = resetToken;
            staff.resetTokenExpiry = Date.now() + 3600000; // Token expires in 1 hour
            await staff.save();

            const mailOptions = {
                from: process.env.ADMIN_EMAIL,
                to: process.env.INSTRUCTOR_EMAIL,
                subject: 'Password Reset',
                text: `Click the following link to reset your password: http://localhost:3000/staffresetpassword/${resetToken}`,
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error(error);
                    res.render("error");
                } else {
                    console.log('Email sent: ' + info.response);
                    res.send('<script>alert("Reset Password link sent to your instructor."); window.location.href="/stafflogin";</script>');


                }
            });
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },

    async staffresetpassword(req, res) {
        try {
            const { snewPassword, resetToken } = req.body;

            const staff = await Staff.findOne({
                resetToken,
                resetTokenExpiry: { $gt: Date.now() }, // Check if the reset token is still valid
            });

            if (!staff) {
                req.flash('error', 'User not found');
                return res.redirect('/stafflogin');
            }

            const hashedPassword = await bcrypt.hash(snewPassword, 10);
            staff.spassword = hashedPassword;
            staff.resetToken = undefined;
            staff.resetTokenExpiry = undefined;

            await staff.save();
            res.render("stafflogin");
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },
    async staffresettoken(req, res) {
        try {
            const { token } = req.params;

            // TODO: Check if the token is valid and not expired in the database
            const staff = await Staff.findOne({
                resetToken: token,
                resetTokenExpiry: { $gt: Date.now() },
            });

            if (!staff) {
                return res.send('<script>alert("Token expired"); window.location.href="/stafflogin";</script>');
            }

            // Token is valid, render the password reset page with the token
            res.render('staffresetpassword', { token });
            // Adjust the above code based on your templating engine and application structure
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },

    async staffverifytoken(req, res) {
        try {
            const { token } = req.params;

            const staff = await Staff.findOne({
                resetToken: token,
                resetTokenExpiry: { $gt: Date.now() }, // Check if the verification token is still valid
            });

            if (!staff) {
                return res.send('<script>alert("Token expired"); window.location.href="/stafflogin";</script>');
            }

            staff.isVerified = true;
            staff.resetToken = undefined;
            staff.resetTokenExpiry = undefined;

            await staff.save();
            res.send('<script>alert("Email verification successful");  window.location.href="/stafflogin"</script>');

        } catch (error) {
            console.error(error);
            res.render("error");
        }
    }

}
module.exports = staffController