const { Note } = require('./models/note');

const noteController = {
   async saveNote(req, res) {
    try {
        const { videoId, content, bookId, timestamp, page, type } = req.body;
        const userId = req.session.User._id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        if (!content || (!videoId && !bookId)) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // For books, check if note/bookmark already exists at this page
        if (bookId && page !== undefined) {
            let existingNote = await Note.findOne({
                userId,
                bookId,
                page,
                type: type || 'note'
            });

            if (existingNote && type === 'bookmark') {
                return res.json({ success: true, note: existingNote });
            }

            if (existingNote && type === 'note') {
                // Update existing note
                existingNote.content = content;
                existingNote.updatedAt = Date.now();
                await existingNote.save();
                return res.json({ success: true, note: existingNote });
            }
        }

        // For videos, check if note already exists at this timestamp
        if (videoId && timestamp !== undefined) {
            let existingNote = await Note.findOne({
                userId,
                videoId,
                timestamp
            });

            if (existingNote) {
                existingNote.content = content;
                existingNote.updatedAt = Date.now();
                await existingNote.save();
                return res.json({ success: true, note: existingNote });
            }
        }

        // Create new note
        const noteData = {
            userId,
            content,
            type: type || 'note'
        };

        if (bookId) {
            noteData.bookId = bookId;
            noteData.page = page;
        }

        if (videoId) {
            noteData.videoId = videoId;
            noteData.timestamp = timestamp;
        }

        const note = new Note(noteData);
        await note.save();
        
        res.json({ success: true, note });
        
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ success: false, error: 'Error saving note: ' + error.message });
    }
},

async getNotes(req, res) {
    try {
        const { videoId } = req.params; // This could be videoId or bookId
        const { page, type } = req.query;
        const userId = req.session.User._id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        let query = { userId };
        
        // Build query based on parameters
        if (type) {
            query.type = type;
        }

        // Try to find by bookId first (for PDF books)
        query.bookId = videoId;
        if (page !== undefined) {
            query.page = parseInt(page);
        }

        let notes = await Note.find(query).sort({ page: 1, createdAt: -1 });
        
        // If no notes found with bookId, try with videoId (for videos)
        if (!notes || notes.length === 0) {
            delete query.bookId;
            delete query.page;
            query.videoId = videoId;
            
            if (page !== undefined) {
                query.timestamp = parseInt(page); // For backward compatibility
            }
            
            notes = await Note.find(query).sort({ timestamp: 1, createdAt: -1 });
        }

        res.json({ success: true, notes: notes || [] });
        
    } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).json({ success: false, error: 'Error fetching notes: ' + error.message });
    }
},

async deleteNote(req, res) {
    try {
        const { noteId } = req.params;
        const userId = req.session.User._id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        if (!noteId) {
            return res.status(400).json({ success: false, error: 'Note ID is required' });
        }

        const note = await Note.findOneAndDelete({
            _id: noteId,
            userId // Ensure user can only delete their own notes
        });

        if (!note) {
            return res.status(404).json({ success: false, error: 'Note not found or unauthorized' });
        }

        res.json({ success: true, message: 'Note deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ success: false, error: 'Error deleting note: ' + error.message });
    }
}
};

module.exports = noteController;
