require('dotenv').config()
const express = require("express");
const path = require("path");
const { User, Video, Contact, Staff } = require("./mongodb");
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

const userController = {
    async signup(req, res) {
    try {
        const { name, email, institute, password } = req.body;

        if (!name || !email || !institute || !password) {
            req.flash('error', 'All fields are required');
            return res.redirect('/signup');
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            req.flash('error', 'User already registered.');
            return res.redirect('/login');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = new User({
            name,
            email,
            institute,
            password: hashedPassword,
            isVerified: false,
        });

        await user.save();

        // Send verification email with user details
        const verificationToken = uuid.v4();
        user.resetToken = verificationToken;
        user.resetTokenExpiry = Date.now() + 3600000; // Token expires in 1 hour
        await user.save();

        // Create HTML email with user details
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>User Verification Request</title>
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
                    <h2>🎓 New User Registration Request</h2>
                    <p>LMS Project - User Verification</p>
                </div>
                
                <h3>A new user has registered and requires verification:</h3>
                
                <div class="user-details">
                    <div class="detail-row">
                        <span class="detail-label">👤 Name:</span>
                        <span class="detail-value">${name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">📧 Email:</span>
                        <span class="detail-value">${email}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">🏫 Institute:</span>
                        <span class="detail-value">${institute}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">📅 Registration Date:</span>
                        <span class="detail-value">${new Date().toLocaleString()}</span>
                    </div>
                </div>
                
                <p><strong>Please review the user details above and click the button below to authorize this registration:</strong></p>
                
                <div class="btn-container">
                    <a href="http://localhost:5000/verify/${verificationToken}" class="verify-btn">
                        ✅ AUTHORIZE USER
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
            subject: '🎓 New User Registration - Verification Required',
            html: htmlContent,
            // Fallback text version
            text: `
                New User Registration Request
                
                User Details:
                Name: ${name}
                Email: ${email}
                Institute: ${institute}
                Registration Date: ${new Date().toLocaleString()}
                
                Please verify this user by clicking the following link:
                http://localhost:5000/verify/${verificationToken}
                
                This link will expire in 1 hour.
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(error);
                req.flash('error', 'Error sending verification email');
                return res.redirect('/error');
            } else {
                console.log('Email sent: ' + info.response);
                req.flash('success', 'User registered successfully. Please wait for admin verification.');
                return res.redirect('/login');
            }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred during registration');
        return res.redirect('/error');
    }
},
async declineUser(req, res) {
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
async authorizeUser(req, res) {
    try {
        console.log('Authorizing user with params:', req.params);
        const { token } = req.params; // Changed from { token, id } to single parameter

        let user;
        
        // First try to find by token (if it looks like a token)
        if (token && token.length > 20) { // Assuming tokens are longer than 20 chars
            user = await User.findOne({
                resetToken: token,
                resetTokenExpiry: { $gt: Date.now() },
            });
        }

        // If not found by token or parameter is shorter (likely an ID)
        if (!user) {
            try {
                console.log('Trying to find user by ID:', token);
                user = await User.findById(token);
            } catch (err) {
                // If ID format is invalid
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid verification token or user ID'
                });
            }
        }

        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid verification token or user ID'
            });
        }

        // Check if already verified
        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'User is already verified'
            });
        }

        user.isVerified = true;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;

        await user.save();

        // Send confirmation email to the user
        const confirmationMailOptions = {
            from: process.env.ADMIN_EMAIL,
            to: user.email,
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
                    
                    <p>Dear ${user.name},</p>
                    
                    <p>Congratulations! Your account has been successfully verified by our administrator.</p>
                    
                    <p><strong>Account Details:</strong></p>
                    <ul>
                        <li><strong>Name:</strong> ${user.name}</li>
                        <li><strong>Email:</strong> ${user.email}</li>
                        <li><strong>Institute:</strong> ${user.institute}</li>
                    </ul>
                    
                    <p>You can now log in to your account and start using the LMS platform.</p>
                    
                    <div class="btn-container">
                        <a href="http://localhost:5000/login" class="login-btn">
                            🚀 LOGIN NOW
                        </a>
                    </div>
                    
                    <p>Welcome to the Grad.LMS!</p>
                    
                    <p>Best regards,<br>Grad.LMS Team</p>
                </div>
            </body>
            </html>
            `,
            text: `
                Account Verified Successfully!
                
                Dear ${user.name},
                
                Your account has been successfully verified. You can now log in at:
                http://localhost:3000/login
                
                Account Details:
                - Name: ${user.name}
                - Email: ${user.email}
                - Institute: ${user.institute}
                
                Welcome to the Grad.LMS!
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
            message: `User ${user.name} has been successfully verified and notified.`,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified
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

async login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('login', {
                error: 'Both fields are required',
                formSubmitted: true,
                email: email || ''
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.render('login', {
                error: 'Invalid email or password',
                formSubmitted: true,
                email: email || ''
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.render('login', {
                error: 'Invalid email or password',
                formSubmitted: true,
                email: email || ''
            });
        }

        if (!user.isVerified) {
            return res.render('login', {
                error: 'Your account is not verified. Please contact your instructor.',
                formSubmitted: true,
                email: email || ''
            });
        }

        req.session.User = user;
        return res.redirect('/student');
    } catch (error) {
        console.error(error);
        return res.render('login', {
            error: 'An error occurred during login',
            formSubmitted: true,
            email: req.body.email || ''
        });
    }
},

    async forgotpassword(req, res) {
        try {
            const { email } = req.body;

            const user = await User.findOne({ email });

            if (!user) {
                req.flash('error', 'User not found.');
                return res.redirect('/login');
            }

            const resetToken = uuid.v4();
            user.resetToken = resetToken;
            user.resetTokenExpiry = Date.now() + 3600000; // Token expires in 1 hour
            await user.save();

            const mailOptions = {

                from: process.env.ADMIN_EMAIL,
                to: process.env.INSTRUCTOR_EMAIL,
                subject: 'Password Reset',
                text: `Click the following link to reset your password: http://localhost:3000/resetpassword/${resetToken}`,
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error(error);
                    req.flash('error', 'Error sending reset password email');
                    return res.redirect('/error');
                } else {
                    console.log('Email sent: ' + info.response);
                    req.flash('success', 'Reset Password link sent to your email.');
                    return res.redirect('/login');
                }
            });
        } catch (error) {
            console.error(error);
            req.flash('error', 'An error occurred');
            return res.redirect('/error');
        }
    },

    async resetpassword(req, res) {
        try {
            const { newPassword, resetToken } = req.body;

            const user = await User.findOne({
                resetToken,
                resetTokenExpiry: { $gt: Date.now() },
            });

            if (!user) {
                req.flash('error', 'User not found.');
                return res.redirect('/login');
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            user.password = hashedPassword;
            user.resetToken = undefined;
            user.resetTokenExpiry = undefined;

            await user.save();
            return res.render('login');
        } catch (error) {
            console.error(error);
            req.flash('error', 'An error occurred');
            return res.redirect('/error');
        }
    },

    async resettoken(req, res) {
        try {
            const { token } = req.params;

            const user = await User.findOne({
                resetToken: token,
                resetTokenExpiry: { $gt: Date.now() },
            });

            if (!user) {
                req.flash('error', 'User not found.');
                return res.redirect('/login');
            }

            return res.render('resetpassword', { token });
        } catch (error) {
            console.error(error);
            req.flash('error', 'An error occurred');
            return res.redirect('/error');
        }
    },

    async verifytoken(req, res) {
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

        // Render verification page with user details
        return res.render('verify-user', { 
            user: {
                name: user.name,
                email: user.email,
                institute: user.institute,
                registrationDate: user.createdAt
            },
            token: token
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'An error occurred');
        return res.redirect('/error');
    }
},

};


module.exports = userController