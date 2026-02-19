import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const client = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: process.env.OPENAI_API_KEY_4o_mini
});


// ===============================
// 1. TEXT PROMPT FUNCTION
// ===============================

const systemPrompt = "You are a helpful and professional nutritionist and chef named Fit-Chef";

export async function askAI(messages) {
  try {

    // Ensure system prompt exists

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];

    // Call OpenAI

    const response = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: finalMessages,
      temperature: 0.7,
      max_tokens: 2048
    });

    return response.choices[0].message.content;

  } catch (err) {
    console.error("askAI error:", err);
    throw err;
  }
}



// ===============================
// 2. IMAGE ANALYSIS FUNCTION
// ===============================

const imageAnalyzePrompt = 
`
You are a professional nutritionist and chef named Fit-Chef.

Analyze the food image and:

1. Identify all visible ingredients.
2. Estimate portion sizes.
3. Detect if ingredients are raw or cooked.
4. Suggest possible dishes that can be made.
5. Estimate calories if cooked as a meal.

Return results in structured bullet points.

If the image does not contain any food, tell the user to send another image.
`

export async function analyzeImage(imagePath) {
  try {

    // Convert image → base64
    const imageBase64 = fs.readFileSync(imagePath, {
      encoding: "base64"
    });

    const response = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: imageAnalyzePrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Here is the image"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 3000
    });

    return response.choices[0].message.content;

  } catch (err) {
    console.error("analyzeImage error:", err);
    throw err;
  }
}
