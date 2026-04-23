import { GoogleGenAI, Type } from "@google/genai";
import { Species } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function identifySpecies(base64Image: string): Promise<Species> {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Analyze this image and identify the species (plant, animal, or fungus). 
            Provide a scientifically accurate identification for adult citizen scientists.
            If the species is potentially hazardous (venomous, poisonous, invasive, or dangerous to touch), clearly state it in the hazards list.
            Return the result in JSON format matching the Species interface.
            
            Status must be one of: "Least Concern", "Vulnerable", "Endangered", "Critically Endangered", "Unknown".
            Category must be one of: "Flora", "Fauna", "Fungi", "Invertebrate".`,
          },
          {
            inlineData: {
              data: base64Image,
              mimeType: "image/jpeg",
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          commonName: { type: Type.STRING },
          scientificName: { type: Type.STRING },
          category: { type: Type.STRING },
          conservationStatus: { type: Type.STRING },
          description: { type: Type.STRING },
          habitat: { type: Type.STRING },
          hazards: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          scientificAccuracyScore: { type: Type.NUMBER },
        },
        required: ["commonName", "scientificName", "category", "conservationStatus", "description", "habitat", "scientificAccuracyScore"],
      },
    },
  });

  const speciesData = JSON.parse(result.text || "{}");
  
  return {
    ...speciesData,
    id: crypto.randomUUID(),
    identifiedAt: new Date().toISOString(),
    imageUrl: `data:image/jpeg;base64,${base64Image}`,
  };
}
