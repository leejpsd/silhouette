# Sample documents

Synthetic documents for the in-app sample mode and for tests. Every person, employer, address and number is invented.

- `w2-en-01.txt`: a Form W-2 for tax year 2025, for the same invented employee and employer as `paystub-en-01.txt`. Its answer key is in `answers.json`. The labels are written without possessives ("Employee name"): the tokenizer treats an apostrophe as unsafe, so "Employee's" is masked in a real form, which the model reads through the other labels.
