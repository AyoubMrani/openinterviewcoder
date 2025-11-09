# test.py
import google.generativeai as genai

# --- IMPORTANT ---
# It's best practice to set your API key as an environment variable
# rather than hardcoding it in the script.
api_key = "AIzaSyDFwGZwsu8eRTDlaMxp987PeCKG79EeXBM"  # Replace with your key
# ---

genai.configure(api_key=api_key)

# -------------------------------------------------------------------
# 1. GET THE MODEL AND DISPLAY ITS LIMITS
# -------------------------------------------------------------------
model_name = 'gemini-2.5-flash'
print(f"Fetching details for model: {model_name}...")

# Get the model's detailed information from the API
model_info = genai.get_model(f'models/{model_name}')

# The input_token_limit is the model's maximum context window
max_input_tokens = model_info.input_token_limit
print(f"-> Maximum Input Tokens (Context Window): {max_input_tokens}")
print(f"-> Maximum Output Tokens: {model_info.output_token_limit}")
print("-" * 20)

# Initialize the model for generation
model = genai.GenerativeModel(model_name)

# -------------------------------------------------------------------
# 2. TRACK TOKEN USAGE FOR THE "SESSION" (YOUR SCRIPT'S RUNTIME)
# -------------------------------------------------------------------
session_total_tokens = 0  # Initialize a counter for our session

# --- FIRST REQUEST ---
prompt1 = "Explain what a Large Language Model is in three simple sentences."

print(f"\nSending Prompt 1: '{prompt1}'")
response1 = model.generate_content(prompt1)
print("Response 1 received.")
print(response1.text)

# Get usage from the first response
usage1 = response1.usage_metadata
total_tokens1 = usage1.total_token_count
session_total_tokens += total_tokens1 # Add to our session total

print("\n--- Usage for Request 1 ---")
print(f"Tokens Used in this Request: {total_tokens1}")
print(f"Total Tokens Used in this Session so far: {session_total_tokens}")
print("-" * 20)


# --- SECOND REQUEST (to show the session total increasing) ---
prompt2 = "What are two popular examples of LLMs?"

print(f"\nSending Prompt 2: '{prompt2}'")
response2 = model.generate_content(prompt2)
print("Response 2 received.")
print(response2.text)

# Get usage from the second response
usage2 = response2.usage_metadata
total_tokens2 = usage2.total_token_count
session_total_tokens += total_tokens2 # Add to our session total again

print("\n--- Usage for Request 2 ---")
print(f"Tokens Used in this Request: {total_tokens2}")
print(f"Total Tokens Used in this Session so far: {session_total_tokens}") # This will now be the sum of both requests
print("-" * 20)