-- Indian Holidays 2025
-- Replace 'your-organization-id' with actual organization UUID

-- Regular Holidays
INSERT INTO holidays (organization_id, name, date, description, is_optional) VALUES
('your-organization-id', 'Republic Day', '2025-01-26', 'National Holiday', false),
('your-organization-id', 'Holi', '2025-03-14', 'Festival of Colors', false),
('your-organization-id', 'Good Friday', '2025-04-18', 'Christian Holiday', false),
('your-organization-id', 'Eid ul-Fitr', '2025-03-31', 'Islamic Festival', false),
('your-organization-id', 'Independence Day', '2025-08-15', 'National Holiday', false),
('your-organization-id', 'Janmashtami', '2025-08-16', 'Krishna Birthday', false),
('your-organization-id', 'Gandhi Jayanti', '2025-10-02', 'National Holiday', false),
('your-organization-id', 'Dussehra', '2025-10-02', 'Victory of Good over Evil', false),
('your-organization-id', 'Diwali', '2025-10-20', 'Festival of Lights', false),
('your-organization-id', 'Christmas', '2025-12-25', 'Christian Holiday', false);

-- Optional Holidays
INSERT INTO holidays (organization_id, name, date, description, is_optional) VALUES
('your-organization-id', 'Makar Sankranti', '2025-01-14', 'Harvest Festival', true),
('your-organization-id', 'Maha Shivaratri', '2025-02-26', 'Hindu Festival', true),
('your-organization-id', 'Ram Navami', '2025-04-06', 'Birth of Lord Rama', true),
('your-organization-id', 'Mahavir Jayanti', '2025-04-10', 'Jain Festival', true),
('your-organization-id', 'Buddha Purnima', '2025-05-12', 'Buddhist Festival', true),
('your-organization-id', 'Eid ul-Adha', '2025-06-07', 'Islamic Festival', true),
('your-organization-id', 'Raksha Bandhan', '2025-08-09', 'Brother-Sister Festival', true),
('your-organization-id', 'Muharram', '2025-07-06', 'Islamic New Year', true),
('your-organization-id', 'Onam', '2025-08-28', 'Kerala Harvest Festival', true),
('your-organization-id', 'Guru Nanak Jayanti', '2025-11-05', 'Sikh Festival', true);
