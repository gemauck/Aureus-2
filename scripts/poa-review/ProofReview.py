"""
ProofReview.py - Proof of Activity (POA) Review and Analysis Module

This module processes fuel transaction and proof of activity data to analyze compliance
and usage patterns for fuel refund eligibility.

BUSINESS CONTEXT:
- POA (Proof of Activity): Records that prove an asset was in use (e.g., empty tank photos)
- Transactions: Fuel dispense/usage records that require proof to be eligible for refunds
- SMR (Service Meter Reading): Hours or kilometers of asset usage

The script identifies:
1. Assets that have transactions but no proof records (non-compliant)
2. How many proof records exist before each transaction
3. Time gaps between proof records and transactions
4. Total SMR usage grouped by transaction batches

OUTPUT:
Generates formatted Excel reports with conditional formatting highlighting:
- Green rows: Transactions with associated proof records
- Yellow cells: Missing SMR data
- Bold rows: Section headers
"""

import pandas as pd
import numpy as np
from FormatExcel import Formatter
from os import listdir

# Columns to include in the final review report
review_cols = [
    "Date & Time","Transaction ID","Asset Description","Asset Number","Asset Group","Asset Tank Size (L)","Asset Meter Type (Hr/Km)",
    "Storage Tank","Fuel Pump","Litres","Total Fuel Used (L)","Operation Description / Comment","Refund Eligibility","Opening SMR",
    "Closing SMR","Total SMR Usage","Material","Location.1","Loads / Tonnes","Activity","Comments","Source","Custom Attribute",
    "No POA Asset","Count of proof before transaction","Time since last activity","total smr"
]

class POAReview:
	"""
	Analyzes fuel transaction data and proof of activity records.
	
	This class processes a DataFrame containing both transaction records (fuel dispenses)
	and proof records (evidence of asset usage). It identifies relationships between them,
	calculates compliance metrics, and prepares data for reporting.
	
	BUSINESS RULES:
	- Transactions are identified by having a "Transaction ID"
	- Proof records are identified by having NO "Transaction ID" but having an "Asset Number"
	- Consecutive transactions within 1 hour are grouped together as a single "label"
	- Each transaction should have proof records associated with it for refund eligibility
	
	Attributes:
		data (pd.DataFrame): The input data containing transactions and proof records
		transaction_mask (pd.Series): Boolean mask identifying transaction rows
		proof_mask (pd.Series): Boolean mask identifying proof record rows
	"""

	def __init__(self, per_asset_report: pd.DataFrame):
		"""
		Initialize the POAReview with transaction and proof data.
		
		Args:
			per_asset_report (pd.DataFrame): DataFrame containing both transaction and proof records.
			                                Must have columns: "Transaction ID", "Asset Number", "Date & Time"
		
		The constructor:
		1. Creates boolean masks to identify transaction vs proof records
		2. Converts date columns to datetime format for time-based analysis
		"""
		self.data = per_asset_report
		
		# Create masks to identify different record types
		# Transactions: Have a Transaction ID (but not the header "Transaction ID")
		self.transaction_mask = (self.data["Transaction ID"].notna()) & (~self.data["Transaction ID"].isin(["Transaction ID"]))
		
		# Proof records: No Transaction ID, but have an Asset Number
		self.proof_mask = (self.data["Transaction ID"].isna()) & (self.data["Asset Number"].notna())
		
		# Convert entire "Date & Time" column to datetime in one go (avoids pandas setitem failure on large masked assignment)
		self.data["Date & Time"] = pd.to_datetime(self.data["Date & Time"], yearfirst=True, errors="coerce")	

	def mark_no_poa_assets(self):
		"""
		Mark assets that have transactions but no proof of activity records.
		
		BUSINESS RULE: For fuel refund eligibility, transactions must have associated
		proof records. Assets with transactions but no proof records are non-compliant.
		
		Returns:
			pd.DataFrame: The data with "No POA Asset" column populated
			
		Note:
			Sets "No POA Asset" = "No Proof of Use Asset" for assets that have
			transactions but never appear in proof records.
		"""
		# Get list of all asset numbers that have proof records
		poa_assets = self.data.loc[self.proof_mask, "Asset Number"].unique()
		
		# Mark assets that have transactions but no proof records
		# Exclude header rows and NaN values
		self.data.loc[(~self.data["Asset Number"].isin(poa_assets)) & 
		              (~self.data["Asset Number"].isin(["Asset Number", np.nan])), 
		              "No POA Asset"] = "No Proof of Use Asset"

		return self.data

	def mark_consecutive_transactions(self):
		"""
		Identify consecutive transactions that occur within 1 hour of each other.
		
		BUSINESS RULE: Transactions within 1 hour are considered part of the same
		dispensing session and should be grouped together for analysis.
		
		Returns:
			pd.DataFrame: The data with "is consec" column populated
			
		Note:
			- "is consec" = 0: Transaction is consecutive (within 1 hour of previous)
			- "is consec" = 1: Transaction starts a new group (more than 1 hour after previous)
			This is used later to create "labels" that group related transactions.
		"""
		# Calculate time difference between consecutive transactions
		time_between_dispenses = self.data.loc[self.transaction_mask, "Date & Time"].diff()

		# Mark as consecutive (0) if within 1 hour, otherwise new group (1)
		self.data.loc[self.transaction_mask, "is consec"] = np.where(
			(time_between_dispenses > pd.Timedelta(hours=0)) & 
			(time_between_dispenses < pd.Timedelta(hours=1)), 
			0,  # Consecutive transaction
			1   # New transaction group
		)

		return self.data

	def label_rows(self):
		"""
		Create unique labels to group related transactions and their proof records.
		
		LABEL FORMAT: "{AssetNumber}-{GroupNumber}"
		Example: "ASSET001-1", "ASSET001-2", "ASSET002-1"
		
		BUSINESS LOGIC:
		1. Transactions are grouped by asset and consecutive status
		2. Each new transaction group (separated by >1 hour) gets a new label number
		3. Proof records are assigned the same label as the next transaction for that asset
		
		Returns:
			pd.DataFrame: The data with "label" column populated
			
		Note:
			The label is used to link proof records to their associated transactions.
			Proof records are backward-filled with the label of the next transaction
			for the same asset, meaning a proof record is associated with the
			transaction that comes after it chronologically.
		"""
		# Ensure consecutive transactions are marked first
		if "is consec" not in self.data.columns:
			self.data.loc[self.transaction_mask, :] = self.mark_consecutive_transactions()

		# Create labels for transactions: AssetNumber-GroupNumber
		# cumsum() on "is consec" creates incrementing group numbers
		# (each 1 in "is consec" starts a new group)
		self.data.loc[self.transaction_mask, "label"] = (
			self.data.loc[self.transaction_mask, "Asset Number"].astype(str) + 
			"-" + 
			self.data.loc[self.transaction_mask, "is consec"].cumsum().astype(int).astype(str)
		)

		# Assign proof records the same label as the next transaction for that asset
		# This links proof records to the transactions they support
		# bfill() (backward fill) propagates transaction labels to preceding proof records
		self.data.loc[self.transaction_mask | self.proof_mask, "label"] = (
			self.data.loc[self.transaction_mask | self.proof_mask, :]
			.groupby("Asset Number")["label"]
			.bfill()
		)

		return self.data

	def count_proof_before_transaction(self):
		"""
		Count how many proof records exist for each transaction label.
		
		BUSINESS METRIC: This indicates compliance - transactions should have
		proof records associated with them. A count of 0 means no proof exists.
		
		Returns:
			pd.DataFrame: The data with "Count of proof before transaction" column populated
			
		Note:
			- Counts proof records grouped by label
			- Maps the count to transactions with the same label
			- Transactions with no proof records get a count of 0
		"""
		# Ensure labels exist
		if "label" not in self.data.columns:
			self.data = self.label_rows()

		# Count proof records per label
		count = self.data.loc[self.proof_mask, "label"].value_counts().to_dict()
		
		# Map counts to transactions with matching labels
		self.data.loc[self.transaction_mask, "Count of proof before transaction"] = (
			self.data.loc[self.transaction_mask, "label"].map(count)
		)
		# Fill NaN with 0 (transactions with no proof records)
		self.data.loc[self.transaction_mask, "Count of proof before transaction"] = (
			self.data.loc[self.transaction_mask, "Count of proof before transaction"].fillna(0)
		)

		return self.data

	def time_since_last_activity(self):
		"""
		Calculate the time (in hours) since the last proof record for each row.
		
		BUSINESS METRIC: This measures the gap between proof records and transactions.
		Large gaps may indicate compliance issues or missing proof records.
		
		Returns:
			pd.DataFrame: The data with "Time since last activity" column populated (in hours)
			
		PROCESS:
		1. Extract timestamps from proof records (where Transaction ID is NaN)
		2. Forward-fill these timestamps by asset to propagate to subsequent transactions
		3. Calculate time difference between current row and last proof record
		4. Convert to hours (multiply by 24)
		"""
		# Ensure prerequisite columns exist
		if "Count of proof before transaction" not in self.data.columns:
			self.data = self.count_proof_before_transaction()

		# Step 1: Extract timestamps from proof records only
		# .where() keeps values where condition is True, sets others to NaN
		self.data.loc[self.transaction_mask | self.proof_mask, "Last Empty Time"] = (
			self.data.loc[self.transaction_mask | self.proof_mask, "Date & Time"]
			.where(self.data.loc[self.transaction_mask | self.proof_mask, "Transaction ID"].isna())
		)

		# Step 2: Forward-fill proof timestamps by asset
		# This propagates each proof record's timestamp to all subsequent rows for that asset
		self.data.loc[self.transaction_mask | self.proof_mask, "Last Empty Time"] = (
			self.data.loc[self.transaction_mask | self.proof_mask, :]
			.groupby("Asset Number")["Last Empty Time"]
			.ffill()
		)

		# Step 3: Calculate time difference and convert to hours
		# (Date difference in pandas gives days, so multiply by 24 for hours)
		self.data.loc[self.transaction_mask | self.proof_mask, "Time since last activity"] = (
			(self.data.loc[self.transaction_mask | self.proof_mask, "Date & Time"] - 
			 self.data.loc[self.transaction_mask | self.proof_mask, "Last Empty Time"]) * 24
		)

		return self.data

	def total_smr(self, sources):
		"""
		Calculate total SMR (Service Meter Reading) usage per transaction label.
		
		SMR represents hours or kilometers of asset usage. This aggregates SMR
		from specified sources and groups by transaction label.
		
		Args:
			sources (list): List of source names to include in the calculation.
			               Example: ["Inmine: Daily Diesel Issues"]
			               
		Returns:
			pd.DataFrame: The data with "total smr" column populated
			
		Note:
			- Only includes rows where "Source" is in the provided sources list
			- Sums "Total SMR Usage" grouped by label
			- Maps the total to transactions with matching labels
			- Transactions with no matching SMR data get 0
		"""
		# Sum SMR usage by label for the specified sources
		hours = (
			self.data.loc[self.data["Source"].isin(sources)]
			.groupby("label")['Total SMR Usage']
			.sum()
			.to_dict()
		)
		
		# Map totals to transactions
		self.data.loc[self.transaction_mask, "total smr"] = (
			self.data.loc[self.transaction_mask, "label"].map(hours)
		)
		# Fill NaN with 0 (transactions with no SMR data)
		self.data.loc[self.transaction_mask, "total smr"] = (
			self.data.loc[self.transaction_mask, "total smr"].fillna(0)
		)
		
		print(hours)  # Debug output: shows the calculated totals
		return self.data

def format_review(review, filename, output_path=None):
	"""
	Format and export the review data to an Excel file with conditional formatting.
	
	CONDITIONAL FORMATTING RULES:
	1. Header row: Light blue background (#CCDAF5), bold, left-aligned
	2. Section headers (non-timestamp in column 0): Bold text
	3. Transactions with proof (has Transaction ID and timestamp): Green background (#D9EAD3)
	4. Missing SMR data (column 15 is empty/0): Yellow background (#FFF2CC) in column 16
	
	Args:
		review (pd.DataFrame): The processed review data
		filename (str): Input filename (used to generate output filename if output_path not provided)
		output_path (str, optional): Full path to output file. If not provided, uses default location.
		
	Output:
		Creates Excel file at the specified output_path or default location
	"""
	# Select only the columns we want in the final report; add missing columns as empty so output shape is consistent
	missing = [c for c in review_cols if c not in review.columns]
	if missing:
		for c in missing:
			review[c] = np.nan
	review = review[review_cols]

	# Generate output path if not provided
	if output_path is None:
		# Generate output filename (remove .csv extension if present, add .xlsx)
		import os
		output_dir = "./Output/Isibonelo Current"
		os.makedirs(output_dir, exist_ok=True)
		output_path = os.path.join(output_dir, filename.rstrip(".csv") + ".xlsx")
	
	# Ensure output directory exists
	import os
	os.makedirs(os.path.dirname(output_path), exist_ok=True)
	
	with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
		# Write DataFrame to Excel
		review.to_excel(writer, sheet_name="Details as Assets", index=False)

		wb = writer.book  
		ws = writer.sheets["Details as Assets"]

		format_review = Formatter(wb)

		# Format header row: light blue background, left-aligned
		format_review.fill_cells(row_start=1, num_rows=1, column_start=1, num_columns=len(review_cols) + 4)
		format_review.left_align(row_start=1, num_rows=1, column_start=1, num_columns=len(review_cols) + 4)
		format_review.create_borders(row_start=1, num_rows=1, column_start=1, num_columns=len(review_cols) + 4, border_style=None)
		
		# Set font size to 9 for entire worksheet
		format_review.set_font(
			row_start=format_review.ws.min_row, 
			num_rows=format_review.ws.max_row, 
			column_start=format_review.ws.min_column, 
			num_columns=format_review.ws.max_column, 
			size=9
		)

		# Apply conditional formatting row by row
		for i, row in enumerate(format_review.ws.iter_rows(min_col=1, max_col=len(review_cols) + 4), start=1):
			
			# Rule 1: Bold section headers (rows where column 0 has text but not a timestamp)
			if row[0].value and not isinstance(row[0].value, pd.Timestamp):
				format_review.make_bold(row_start=i, num_rows=1, column_start=1, num_columns=len(review_cols) + 4, size=9)

			# Rule 2: Green background for transactions with proof
			# (has Transaction ID in column 1, and timestamp in column 0, but not header row)
			if row[1].value and i != 1 and isinstance(row[0].value, pd.Timestamp):
				format_review.fill_cells(row_start=i, num_rows=1, column_start=1, num_columns=len(review_cols) + 4, color="D9EAD3")

			# Rule 3: Yellow background for missing SMR data
			# Column 15 = "Total SMR Usage", Column 16 = next column
			# Condition: (no SMR value AND no Transaction ID AND has timestamp) OR (SMR = 0)
			# But exclude the header row
			has_timestamp = isinstance(row[0].value, pd.Timestamp)
			no_transaction_id = not row[1].value
			no_smr_value = not row[15].value or row[15].value == 0
			is_not_header = row[15].value != "Total SMR Usage"
			
			if has_timestamp and (no_smr_value and no_transaction_id or row[15].value == 0) and is_not_header:
				format_review.fill_cells(row_start=i, num_rows=1, column_start=16, num_columns=1, color="FFF2CC")

# ============================================================================
# MAIN EXECUTION SCRIPT
# ============================================================================
# Processes all Excel files in the input directory and generates formatted reports
# ============================================================================

if __name__ == "__main__":
	# Input directory containing Excel files to process
	input_dir = './input/Isibonelo Current'
	
	# Get list of all files in input directory
	inputs = listdir(input_dir)
	
	for file in inputs:
		print("--------starting review---------")
		print("		opening file	")
		print(file)
		
		# Read Excel file (skip first row which may be a header)
		# NOTE: Adjust skiprows if your file format differs
		data = pd.read_excel(f"{input_dir}/{file}", skiprows=1)
		
		print("		reviewing		")
		
		# Initialize review and run analysis
		review = POAReview(data)
		review.mark_no_poa_assets()  # Identify non-compliant assets
		review.time_since_last_activity()  # Calculate time gaps
		review.total_smr(["Inmine: Daily Diesel Issues"])  # Calculate SMR totals
		
		print("		formatting		")
		
		# Generate formatted Excel output
		format_review(review.data, file)
		
		print('		done   	')





# .to_excel("./Output/Mafube/Mafube Coal Mining (Pty) Ltd - Proof of Activity - May 2025.xlsx")