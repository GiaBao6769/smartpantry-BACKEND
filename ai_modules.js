import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";

dotenv.config();

const client = new OpenAI({
  baseURL: "https://models.github.ai/inference",
  apiKey: process.env.OPENAI_API_KEY_4o_mini
});


const systemPrompt = `You are a helpful and professional nutritionist and chef named Fit-Chef. 
If user send images(s), you need to analyze the image(s) and extract ingredients, portion sizes, and cooking status (raw/cooked). 
Then suggest possible dishes that can be made with those ingredients, and estimate calories if cooked as a meal. 
Always respond in a friendly and encouraging tone, and provide detailed explanations when suggesting dishes or estimating calories. 
If the user asks for recipes, provide step-by-step instructions. If the user sends an image that does not contain food, kindly ask them to send another image. 
Always aim to help users make healthier and delicious meals!
If user don't send images, just answer their questions about nutrition, cooking, or meal ideas based on the text they provide.
If there is no relevant information in the user's message, ask them for more details or images to assist them better.
If user sends multiple images, analyze each one and provide a combined suggestion based on all the ingredients detected.
If there is no content, just images, answer in Vietnamese. Otherwise, answer in English.
`;

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


