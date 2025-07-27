const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' }, // Optional for videos
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },   // Optional for books
    content: { type: String, required: true },
    timestamp: { type: Number }, // For video notes
    page: { type: Number },      // For book notes/bookmarks
    type: { type: String, enum: ['note', 'bookmark'], default: 'note' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', noteSchema);
module.exports = { Note };
