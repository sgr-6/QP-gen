const mammoth = require('mammoth');

mammoth.convertToHtml({path: "../Model Question paper.docx"})
    .then(function(result){
        const html = result.value; 
        console.log(html);
    })
    .catch(console.error);
