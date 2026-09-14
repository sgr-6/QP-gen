const { db, admin } = require('../config/firebaseAdmin');

const listReleasedPapers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const draftsRef = db.collection('drafts')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'released');
    
    const snapshot = await draftsRef.get();
    
    const papers = snapshot.docs.map(doc => {
      const data = doc.data();
      // Remove the actual paper JSON
      delete data.paper;
      return { id: doc.id, ...data };
    });
    
    res.json({ papers });
  } catch (error) {
    console.error("Error listing released papers:", error);
    res.status(500).json({ error: 'Failed to list released papers' });
  }
};

const logPrintJob = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const draftId = req.params.id;
    const { copies } = req.body;
    
    if (!copies || typeof copies !== 'number' || copies <= 0) {
      return res.status(400).json({ error: 'Valid number of copies is required' });
    }
    
    const printLogsRef = db.collection('print_logs');
    
    await printLogsRef.add({
      tenantId,
      draftId,
      copies,
      printedBy: req.user.userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ message: 'Print job logged successfully' });
  } catch (error) {
    console.error("Error logging print job:", error);
    res.status(500).json({ error: 'Failed to log print job' });
  }
};

module.exports = {
  listReleasedPapers,
  logPrintJob
};
