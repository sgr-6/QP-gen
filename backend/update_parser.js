const fs = require('fs');

let content = fs.readFileSync('src/services/parserService.js', 'utf-8');

// Replace imports
content = content.replace(
  `const { inferTags } = require('./aiService');`,
  `const { inferTags, checkImageSanity } = require('./aiService');\nconst crypto = require('crypto');\nconst { admin } = require('../config/firebaseAdmin');`
);

// Replace parseFile signature and pass tenantId
content = content.replace(
  `const parseFile = async (fileUrl, ext) => {`,
  `const parseFile = async (fileUrl, ext, tenantId) => {`
);

// Replace parseDOCX call inside switch
content = content.replace(
  `rawQuestions = await parseDOCX(fileUrl);`,
  `rawQuestions = await parseDOCX(fileUrl, tenantId);`
);

// Replace parseDOCX signature and implementation
const oldDocxStart = `const parseDOCX = async (url) => {`;
const newDocx = `const parseDOCX = async (url, tenantId) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  
  const options = {
    convertImage: mammoth.images.imgElement(function(image) {
      return image.read("base64").then(async function(imageBase64) {
        const ext = image.contentType.split('/')[1] || 'jpeg';
        const binaryBuffer = Buffer.from(imageBase64, 'base64');
        
        // Hash the buffer
        const hash = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
        
        // Check image sanity
        const isSane = await checkImageSanity(imageBase64, image.contentType);
        if (!isSane) {
          return { src: "" };
        }
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
        const file = bucket.file(\`\${tenantId}/images/\${hash}.\${ext}\`);
        await file.save(binaryBuffer, { contentType: image.contentType });
        await file.makePublic();
        const publicUrl = \`https://storage.googleapis.com/\${bucket.name}/\${file.name}\`;
        
        return { src: publicUrl };
      });
    })
  };

  const result = await mammoth.convertToHtml({ buffer }, options);
  
  const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndownService.use(turndownPluginGfm.tables);
  const markdown = turndownService.turndown(result.value);`;

content = content.replace(
  /const parseDOCX = async \(url\) => \{[\s\S]*?const markdown = turndownService\.turndown\(result\.value\);/,
  newDocx
);

fs.writeFileSync('src/services/parserService.js', content);
