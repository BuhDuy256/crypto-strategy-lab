import { OpenAiResponsesSentimentAnalyzer, type OpenAiResponsesClient } from "./openai-responses-sentiment-analyzer.js";
import { OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT } from "./openai-responses-sentiment-analyzer.js";
import { defineSentimentAnalyzerContract } from "../testing/sentiment-analyzer-contract.js";

const successfulClient: OpenAiResponsesClient = {
  async create() {
    return {
      status: "completed",
      model: OPENAI_RESPONSES_SENTIMENT_MODEL_SNAPSHOT,
      outputText: '{"label":"neutral","score":0.5}'
    };
  }
};

defineSentimentAnalyzerContract("OpenAiResponsesSentimentAnalyzer", () => ({
  createAvailableAnalyzer: () => new OpenAiResponsesSentimentAnalyzer(successfulClient),
  createUnavailableAnalyzer: () => new OpenAiResponsesSentimentAnalyzer(undefined)
}));
