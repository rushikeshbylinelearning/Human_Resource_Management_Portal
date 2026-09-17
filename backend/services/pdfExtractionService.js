const pdfParse = require('pdf-parse');
const { getPolicyBucket } = require('../db');
const mongoose = require('mongoose');

/**
 * Extracts text from a GridFS-stored PDF.
 * Reuses the existing getPolicyBucket() from db.js.
 * @param {ObjectId} fileId - GridFS file ID
 * @returns {Promise<string>} - Extracted plain text
 */
async function extractTextFromGridFS(fileId) {
  const bucket = getPolicyBucket();
  const chunks = [];
  
  return new Promise((resolve, reject) => {
    const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
    
    downloadStream.on('data', (chunk) => chunks.push(chunk));
    downloadStream.on('error', (err) => {
      console.error('GridFS download error:', err);
      reject(err);
    });
    downloadStream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const data = await pdfParse(buffer);
        resolve(data.text); // Extracted plain text
      } catch (err) {
        console.error('PDF parsing error:', err);
        reject(err);
      }
    });
  });
}

module.exports = { extractTextFromGridFS };
