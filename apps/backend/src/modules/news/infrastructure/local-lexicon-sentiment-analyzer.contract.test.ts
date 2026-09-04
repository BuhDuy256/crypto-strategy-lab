import { UnavailableFakeSentimentAnalyzer } from "../testing/fake-sentiment-analyzer.js";
import { defineSentimentAnalyzerContract } from "../testing/sentiment-analyzer-contract.js";
import { LocalLexiconSentimentAnalyzer } from "./local-lexicon-sentiment-analyzer.js";

defineSentimentAnalyzerContract("LocalLexiconSentimentAnalyzer", () => ({
  createAvailableAnalyzer: () => new LocalLexiconSentimentAnalyzer(),
  createUnavailableAnalyzer: () => new UnavailableFakeSentimentAnalyzer("fallback unavailable")
}));
