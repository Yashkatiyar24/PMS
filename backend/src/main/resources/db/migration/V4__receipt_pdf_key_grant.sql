-- A receipt's financial content is immutable, but the key of the PDF we rendered for it is written
-- after issue (the first time someone prints or sends it). Grant exactly that column, nothing else.
GRANT UPDATE (pdf_key) ON receipts TO pms_app;
