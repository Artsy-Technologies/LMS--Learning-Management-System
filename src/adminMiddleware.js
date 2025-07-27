const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session && req.session.Admin && req.session.Admin.isAdmin) {
        return next();
    } else {
        req.flash('error', 'Access denied. Admin login required.');
        res.redirect('/adminlogin');
    }
};
module.exports = { isAuthenticatedAdmin };