# LLM Analysis Setup for Diesel Refund Evidence Evaluator

This document explains how to set up and use the GPT/LLM-powered analysis feature for the Diesel Refund Evidence Evaluator tool.

## Overview

The Diesel Refund Evidence Evaluator now supports AI-powered analysis using OpenAI's GPT models. This provides more intelligent and context-aware evaluation of documents compared to the basic pattern-matching approach.

## Features

- **Intelligent Document Analysis**: Uses GPT models to understand document context and structure
- **Multi-format Support**: Analyzes Excel files (.xlsx, .xls), text files (.txt, .csv), and JSON data
- **Comprehensive Evaluation**: Provides detailed analysis including:
  - Document classification (File 1-7 structure)
  - Field detection and validation
  - Date and amount extraction
  - Entity recognition
  - Actionable recommendations
- **Fallback Support**: Automatically falls back to basic evaluation if LLM is unavailable

## Setup Instructions

### 1. Install Dependencies

The OpenAI SDK is already included in `package.json`. Install it by running:

```bash
npm install
```

### 2. Configure Environment Variables

Add the following environment variable to your `.env` file:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Specify which GPT model to use (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

### 3. Get an OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `.env` file

**Note**: The API key will be charged based on OpenAI's pricing. `gpt-4o-mini` is recommended for cost-effective analysis.

### 4. Restart the Server

After adding the environment variable, restart your server:

```bash
npm start
# or for development
npm run dev
```

## Usage

### In the Application

1. Navigate to **Tools** → **Diesel Refund Evidence Evaluator**
2. Toggle **"Use AI Analysis (GPT)"** checkbox (enabled by default)
3. Choose your input mode:
   - **JSON**: Paste JSON data
   - **Text**: Paste plain text
   - **File**: Upload Excel, CSV, or text files
4. Click **"Evaluate Evidence"**

### API Endpoint

You can also call the API directly:

```javascript
POST /api/tools/analyze-evidence
Content-Type: application/json
Authorization: Bearer <token>

{
  "file": {
    "name": "document.xlsx",
    "dataUrl": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,...",
    "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  },
  "useLLM": true,
  "model": "gpt-4o-mini" // optional
}
```

Or with direct content:

```javascript
{
  "content": "Your document content here...",
  "fileName": "document.txt",
  "useLLM": true
}
```

## Supported File Types

- **Excel**: `.xlsx`, `.xls` (parsed and converted to text)
- **Text**: `.txt`, `.csv` (read directly)
- **JSON**: Direct JSON objects or strings
- **PDF**: Not yet implemented (will be added in future updates)

## Response Format

The API returns a comprehensive analysis:

```json
{
  "success": true,
  "fileName": "document.xlsx",
  "analysis": {
    "isValid": true,
    "evidenceType": "Asset Register - Mining Assets",
    "fileCategory": "File 4",
    "relevanceScore": 85,
    "criteria": {
      "hasRequiredFields": true,
      "hasValidDates": true,
      "hasValidAmounts": true,
      "hasSupportingDocuments": false,
      "isComplete": true
    },
    "issues": [],
    "recommendations": ["Consider adding supporting documentation"],
    "metadata": {
      "detectedFields": ["assetNumber", "description", "category"],
      "detectedDates": ["2025-01-15"],
      "detectedAmounts": ["125000"],
      "detectedEntities": ["ABC Mining Company"]
    },
    "summary": "This document is a valid asset register...",
    "confidence": 92,
    "method": "llm",
    "model": "gpt-4o-mini"
  },
  "contentLength": 15234,
  "timestamp": "2025-01-08T12:23:45.123Z"
}
```

## Cost Considerations

- **gpt-4o-mini**: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens
- **gpt-4o**: ~$2.50 per 1M input tokens, ~$10.00 per 1M output tokens
- Average document analysis: ~1,000-5,000 tokens per request

**Recommendation**: Use `gpt-4o-mini` for cost-effective analysis. It provides excellent results for document evaluation tasks.

## Troubleshooting

### LLM Analysis Not Working

1. **Check API Key**: Ensure `OPENAI_API_KEY` is set in your `.env` file
2. **Check API Key Validity**: Verify the key is active on OpenAI platform
3. **Check Network**: Ensure the server can reach OpenAI API (api.openai.com)
4. **Check Logs**: Look for error messages in server console
5. **Fallback Mode**: The system will automatically use basic evaluation if LLM fails

### File Upload Issues

- **File Size**: Maximum 20MB per file
- **File Type**: Ensure the file type is supported (Excel, Text, CSV)
- **Encoding**: Text files should be UTF-8 encoded

### Rate Limiting

OpenAI has rate limits based on your account tier. If you encounter rate limit errors:
- Wait a few seconds and retry
- Consider upgrading your OpenAI plan
- Implement request queuing for high-volume usage

## Security Notes

- **API Key Security**: Never commit your `.env` file to version control
- **File Upload Limits**: Files are limited to 20MB to prevent abuse
- **Authentication**: The endpoint requires authentication (uses `authRequired` middleware)
- **Data Privacy**: Document content is sent to OpenAI for analysis. Ensure compliance with your data privacy policies.

## Future Enhancements

- [ ] PDF parsing support
- [ ] Support for other LLM providers (Anthropic Claude, local models)
- [ ] Batch processing for multiple documents
- [ ] Caching of analysis results
- [ ] Custom prompt templates
- [ ] Multi-language support

## Support

For issues or questions, please contact the development team or create an issue in the project repository.

