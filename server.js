require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // for base64 images

// Proxy to Groq chat (supports streaming and vision)
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, promptOverride } = req.body;

        // Determine model based on whether images are present
        const hasImage = messages.some(msg => 
            msg.role === 'user' && 
            Array.isArray(msg.content) && 
            msg.content.some(c => c.type === 'image_url')
        );
        const model = hasImage 
            ? "meta-llama/llama-4-scout-17b-16e-instruct" 
            : "llama-3.3-70b-versatile";

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        res.setHeader('Content-Type', 'text/plain');
        groqRes.body.pipe(res);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Groq API error" });
    }
});

// Proxy to Freepik text-to-image
app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt } = req.body;

        const freepikRes = await fetch('https://api.freepik.com/v1/ai/text-to-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-freepik-api-key': process.env.FREEPIK_API_KEY
            },
            body: JSON.stringify({
                prompt,
                negative_prompt: "blurry, distorted, low quality",
                guidance_scale: 7,
                num_images: 1,
                image: { size: "square_1_1" }
            })
        });

        const data = await freepikRes.json();
        
        if (!freepikRes.ok) throw new Error(data.message || "Freepik error");

        const imageData = data.data[0];
        res.json({
            base64: imageData.base64 || null,
            url: imageData.url || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = app;