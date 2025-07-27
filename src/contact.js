const { User, Contact } = require("./mongodb");

const contactController = {
    async contact(req, res) {
        try {
            const { cname, email, message } = req.body;

            // Basic validation
            if (!cname || !email || !message) {
                req.flash('error', 'All fields are required');
                return res.redirect('/contact');
            }

            const user = await User.findOne({ email });

            if (!user) {
                return res.render("login");
            }

            // Create a new Contact document
            const newContact = new Contact({
                cname: cname,
                email: email,
                message,
            });

            // Save the document to the database
            await newContact.save();

            // Send a response to the client
            res.send('<script>alert("Message received Successfully"); window.location.href="/login";</script>');
        } catch (error) {
            console.error(error);
            res.render("error");
        }
    },

};

module.exports = contactController;