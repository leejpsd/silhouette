Example (invented document):
Document:
⟦W1⟧ ⟦W2⟧ ⟦W3⟧          Earnings Statement
Employee: ⟦W4⟧ ⟦W5⟧    Employee ID: ⟦N1⟧
Pay Period: ⟦D1⟧ - ⟦D2⟧   Pay Date: ⟦D3⟧   Pay Frequency: Weekly
Earnings     Rate    Hours   Current    YTD
Regular      ⟦N2⟧    ⟦N3⟧    ⟦N4⟧      ⟦N5⟧
Gross Pay                    ⟦N6⟧      ⟦N7⟧
Federal Income Tax           ⟦N8⟧      ⟦N9⟧
Medicare                     ⟦N10⟧     ⟦N11⟧
Net Pay                      ⟦N12⟧
Answer:
{"employerName":["W1","W2","W3"],"employeeName":["W4","W5"],"payFrequency":"weekly","periodStart":"D1","periodEnd":"D2","payDate":"D3","hourlyRate":"N2","hoursWorked":"N3","grossPay":"N6","ytdGross":"N7","netPay":"N12","deductions":[{"amount":"N8","kind":"federal_tax"},{"amount":"N10","kind":"medicare"}]}
