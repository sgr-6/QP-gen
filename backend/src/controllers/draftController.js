const { db, admin } = require('../config/firebaseAdmin');
const { generatePaper } = require('../services/paperGeneratorService');
const supabase = require('../config/supabaseClient');
const fs = require('fs');
const path = require('path');
const { encryptData, decryptData, generateSHA256Hash } = require('../utils/cryptoUtils');

const generateDraft = async (req, res) => {
  try {
    const { courseTitle, examType, examConfig, formatSelection, customFormatInstructions } = req.body;
    if (!courseTitle) {
      return res.status(400).json({ error: 'Course Title is required' });
    }
    const tenantId = req.user.tenantId;

    const paper = await generatePaper(courseTitle, examType, examConfig, tenantId, formatSelection, customFormatInstructions);
    
    res.json({
      message: 'Draft generated successfully!',
      paper: paper
    });

  } catch (error) {
    console.error("Draft Generation Error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

const saveDraft = async (req, res) => {
  try {
    const { courseTitle, paper } = req.body;
    if (!courseTitle || !paper) {
      return res.status(400).json({ error: 'courseTitle and paper are required' });
    }
    const tenantId = req.user.tenantId;
    const draftsRef = db.collection('drafts');
    
    // Encrypt the paper object before saving
    const encryptedPaper = encryptData(paper);

    const draftDoc = await draftsRef.add({
      tenantId,
      courseTitle,
      paper: encryptedPaper,
      status: 'draft',
      createdBy: req.user.userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      comments: [],
      embargoTimestamp: null,
      releaseHash: null,
      generatorInfo: null
    });

    res.json({ message: 'Draft saved successfully', draftId: draftDoc.id });
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
};

// Firestore Timestamps serialize as {_seconds,...}; send ISO strings the UI can parse.
const toIso = value => (value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value ?? null);
const serializeDraft = (id, data) => ({ id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), embargoTimestamp: toIso(data.embargoTimestamp) });

const listDrafts = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { role, userId } = req.user;
    let draftsRef = db.collection('drafts').where('tenantId', '==', tenantId);

    if (role === 'professor') {
      draftsRef = draftsRef.where('createdBy', '==', userId);
    } else if (role === 'hod') {
      draftsRef = draftsRef.where('status', '==', 'pending_hod_approval');
    } else if (role === 'controller_of_exams') {
      draftsRef = draftsRef.where('status', 'in', ['pending_coe_release', 'released']);
    } else if (role === 'early_access') {
      draftsRef = draftsRef.where('status', '==', 'released');
    }

    const snapshot = await draftsRef.get();
    let drafts = snapshot.docs.map(doc => {
      const data = doc.data();
      if (data.paper && typeof data.paper === 'string') {
        try {
          data.paper = decryptData(data.paper);
        } catch(e) {
          console.error("Failed to decrypt paper", e);
        }
      }
      return serializeDraft(doc.id, data);
    });

    if (role === 'hod') {
      const ownDraftsSnapshot = await db.collection('drafts')
        .where('tenantId', '==', tenantId)
        .where('createdBy', '==', userId)
        .get();
      
      const ownDrafts = ownDraftsSnapshot.docs.map(doc => {
        const data = doc.data();
        if (data.paper && typeof data.paper === 'string') {
          try { data.paper = decryptData(data.paper); } catch(e) {}
        }
        return serializeDraft(doc.id, data);
      });
      const allDrafts = [...drafts, ...ownDrafts];
      const uniqueDrafts = Array.from(new Map(allDrafts.map(item => [item.id, item])).values());
      return res.json({ drafts: uniqueDrafts });
    }

    res.json({ drafts });
  } catch (error) {
    console.error("Error listing drafts:", error);
    res.status(500).json({ error: 'Failed to list drafts' });
  }
};

// Allowed workflow moves: { fromStatus: { toStatus: [roles] } }.
// 'released' is reachable only through releaseDraft, which hashes and embargoes the paper.
const STATUS_TRANSITIONS = {
  draft: { pending_hod_approval: ['professor', 'hod'] },
  pending_hod_approval: { pending_coe_release: ['hod'], draft: ['hod'] },
  pending_coe_release: { draft: ['controller_of_exams'], pending_hod_approval: ['controller_of_exams'] }
};

function statusTransitionError(draftData, nextStatus, user) {
  const current = draftData.status || 'draft';
  const allowedRoles = STATUS_TRANSITIONS[current]?.[nextStatus];
  if (!allowedRoles) return { status: 400, error: `Cannot move a draft from "${current}" to "${nextStatus}".` };
  if (user.role !== 'super_admin' && !allowedRoles.includes(user.role)) return { status: 403, error: 'Insufficient permissions for this status change.' };
  const isCreator = draftData.createdBy === user.userId;
  if (nextStatus === 'pending_hod_approval' && current === 'draft' && !isCreator && user.role !== 'super_admin') {
    return { status: 403, error: 'Only the creator can submit this draft for review.' };
  }
  if (nextStatus === 'pending_coe_release' && isCreator) {
    return { status: 403, error: 'Maker-Checker violation: You cannot approve a draft you created.' };
  }
  return null;
}

const updateDraftStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const draftRef = db.collection('drafts').doc(id);
    const draft = await draftRef.get();
    
    if (!draft.exists) return res.status(404).json({ error: 'Draft not found' });
    
    const draftData = draft.data();
    if (draftData.tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant access' });
    }

    const transitionError = statusTransitionError(draftData, status, req.user);
    if (transitionError) return res.status(transitionError.status).json({ error: transitionError.error });

    await draftRef.update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: `Draft status updated to ${status}` });
  } catch (error) {
    console.error("Error updating draft status:", error);
    res.status(500).json({ error: 'Failed to update draft status' });
  }
};

const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionId, text } = req.body;
    const draftRef = db.collection('drafts').doc(id);
    const draft = await draftRef.get();
    
    if (!draft.exists) return res.status(404).json({ error: 'Draft not found' });
    
    if (draft.data().tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant access' });
    }

    const newComment = {
      questionId,
      text,
      authorId: req.user.userId,
      authorRole: req.user.role,
      timestamp: new Date().toISOString()
    };

    await draftRef.update({
      comments: admin.firestore.FieldValue.arrayUnion(newComment),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Comment added', comment: newComment });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
};

const releaseDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { embargoTimestamp } = req.body;
    
    if (!embargoTimestamp) return res.status(400).json({ error: 'Embargo timestamp is required' });

    const draftRef = db.collection('drafts').doc(id);
    const draft = await draftRef.get();
    
    if (!draft.exists) return res.status(404).json({ error: 'Draft not found' });
    
    if (draft.data().tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: 'Unauthorized tenant access' });
    }
    if (draft.data().status !== 'pending_coe_release') {
      return res.status(409).json({ error: 'Only HOD-approved drafts awaiting COE release can be released.' });
    }
    if (Number.isNaN(new Date(embargoTimestamp).getTime())) {
      return res.status(400).json({ error: 'Embargo timestamp is invalid' });
    }

    // Decrypt the paper to hash it
    let paperData = draft.data().paper;
    if (typeof paperData === 'string') {
      try { paperData = decryptData(paperData); } catch(e) {}
    }

    const releaseHash = generateSHA256Hash(paperData);

    await draftRef.update({
      status: 'released',
      embargoTimestamp: admin.firestore.Timestamp.fromDate(new Date(embargoTimestamp)),
      releaseHash: releaseHash,
      generatorInfo: {
        releasedBy: req.user.userId,
        releasedAt: new Date().toISOString()
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Draft released successfully', releaseHash });
  } catch (error) {
    console.error("Error releasing draft:", error);
    res.status(500).json({ error: 'Failed to release draft' });
  }
};

const verifyPaper = async (req, res) => {
  try {
    const { hash } = req.params;
    if (!hash) return res.status(400).json({ error: 'Hash is required' });

    const draftsRef = db.collection('drafts').where('releaseHash', '==', hash).limit(1);
    const snapshot = await draftsRef.get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Paper not found or hash invalid' });
    }

    const draftData = snapshot.docs[0].data();

    // Do NOT return the paper content to the public
    return res.json({
      verified: true,
      courseTitle: draftData.courseTitle,
      status: draftData.status,
      createdAt: draftData.createdAt?.toDate(),
      generatorInfo: draftData.generatorInfo
    });

  } catch (error) {
    console.error("Error verifying paper:", error);
    res.status(500).json({ error: 'Failed to verify paper' });
  }
}

const downloadDraft = async (req, res) => {
  try {
    const { id } = req.params;
    let paper;
    let tenantId = req.user.tenantId;
    let downloaderIdentity = req.user.email || req.user.userId;

    if (id) {
      const draftRef = db.collection('drafts').doc(id);
      const draft = await draftRef.get();
      if (!draft.exists) return res.status(404).json({ error: 'Draft not found' });
      const draftData = draft.data();
      if (draftData.tenantId !== req.user.tenantId) return res.status(403).json({ error: 'Unauthorized' });
      
      paper = draftData.paper;
      if (typeof paper === 'string') {
        try { paper = decryptData(paper); } catch(e) {}
      }
      
      if (draftData.embargoTimestamp) {
        const now = new Date();
        const embargo = draftData.embargoTimestamp.toDate();
        if (now < embargo) {
          if (req.user.role !== 'controller_of_exams' && req.user.role !== 'early_access' && req.user.role !== 'super_admin' && req.user.role !== 'print_admin') {
            return res.status(403).json({ error: 'Paper is under embargo and cannot be downloaded yet.' });
          }
        }
      }
    } else {
      paper = req.body.paper;
    }

    if (!paper || !paper.courseTitle) {
      return res.status(400).json({ error: 'Paper JSON is required' });
    }
    
    const { generatePDFBuffer } = require('../services/pdfService');
    const pdfBuffer = await generatePDFBuffer(paper, tenantId, downloaderIdentity);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${paper.courseTitle.replace(/\s+/g, '_')}_Draft.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error in downloadDraft:", error);
    res.status(500).json({ error: 'Failed to download draft' });
  }
};

const saveFinalPaper = async (req, res) => {
  try {
    const { paper } = req.body;
    if (!paper || !paper.courseTitle) {
      return res.status(400).json({ error: 'Paper JSON with courseTitle is required' });
    }

    const tenantId = req.user.tenantId;
    let downloaderIdentity = req.user.email || req.user.userId;
    const { generatePDFBuffer } = require('../services/pdfService');
    const pdfBuffer = await generatePDFBuffer(paper, tenantId, downloaderIdentity);
    
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const fileName = `${tenantId}/final_papers/${Date.now()}_Final_${paper.courseTitle.replace(/\s+/g, '_')}.pdf`;
    const file = bucket.file(fileName);
    
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    const bankRef = db.collection('question_banks').doc(`${tenantId}_${paper.courseTitle.replace(/\s+/g, '_').toLowerCase()}`);
    
    const finalPaperRef = bankRef.collection('final_papers').doc(fileName.split('/').pop());
    await finalPaperRef.set({
      tenantId,
      courseTitle: paper.courseTitle,
      finalPdfUrl: publicUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      savedBy: req.user.userId || 'anonymous'
    });

    res.json({
      message: 'Final paper securely saved to Firebase Storage',
      url: publicUrl
    });

  } catch (error) {
    console.error("Error in saveFinalPaper:", error);
    res.status(500).json({ error: 'Failed to save final paper' });
  }
};

const downloadPdf = async (req, res) => {
  try {
    const courseTitle = req.body.courseTitle;
    if (!courseTitle) {
      return res.status(400).json({ error: 'courseTitle is required' });
    }
    const tenantId = req.user.tenantId;
    let downloaderIdentity = req.user.email || req.user.userId;
    const paper = await generatePaper(courseTitle, null, null, tenantId);
    const { generatePDFBuffer } = require('../services/pdfService');
    const pdfBuffer = await generatePDFBuffer(paper, tenantId, downloaderIdentity);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${courseTitle.replace(/\s+/g, '_')}_Paper.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error in downloadPdf:", error);
    res.status(500).json({ error: error.message || 'Failed to download PDF' });
  }
};

module.exports = {
  generateDraft,
  saveDraft,
  listDrafts,
  updateDraftStatus,
  addComment,
  releaseDraft,
  verifyPaper,
  downloadDraft,
  saveFinalPaper,
  downloadPdf
};
