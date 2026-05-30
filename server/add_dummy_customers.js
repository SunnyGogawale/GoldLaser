const mongoose = require('mongoose');
const Customer = require('./models/Customer');
require('dotenv').config();

const dummyCustomers = [];
const firstNames = ['John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'Robert', 'Amanda', 'William', 'Jessica', 'Richard', 'Jennifer', 'Joseph', 'Elizabeth', 'Thomas', 'Patricia', 'Christopher', 'Linda', 'Daniel', 'Barbara', 'Paul', 'Margaret', 'Mark', 'Susan', 'Donald', 'Dorothy', 'George', 'Lisa', 'Kenneth', 'Nancy', 'Steven', 'Karen', 'Edward', 'Betty', 'Brian', 'Helen', 'Ronald', 'Sandra', 'Anthony', 'Donna', 'Kevin', 'Carol', 'Jason', 'Ruth', 'Matthew', 'Sharon', 'Gary', 'Michelle', 'Timothy', 'Laura', 'Larry', 'Cynthia', 'Jeffrey', 'Angela', 'Frank', 'Melissa', 'Scott', 'Brenda', 'Eric', 'Amy', 'Stephen', 'Anna', 'Andrew', 'Rebecca', 'Raymond', 'Virginia', 'Gregory', 'Kathleen', 'Joshua', 'Pamela', 'Dennis', 'Martha', 'Jerry', 'Debra', 'Walter', 'Amanda', 'Patrick', 'Stephanie', 'Peter', 'Carolyn', 'Harold', 'Christine', 'Douglas', 'Marie', 'Henry', 'Janet', 'Carl', 'Catherine', 'Arthur', 'Frances', 'Ryan', 'Ann', 'Roger', 'Joyce', 'Joe', 'Diane'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'San Francisco', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver', 'Washington', 'Boston', 'El Paso', 'Nashville', 'Detroit', 'Oklahoma City'];

for (let i = 1; i <= 90; i++) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const city = cities[Math.floor(Math.random() * cities.length)];
  
  dummyCustomers.push({
    customerName: `${firstName} ${lastName}`,
    contactNumber: `+1-${555}${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    address: `${Math.floor(Math.random() * 999) + 1} ${['Main St', 'Oak Ave', 'Maple Rd', 'Pine Ln', 'Cedar Dr', 'Birch Ct', 'Willow Way'][Math.floor(Math.random() * 7)]}, ${city}, ${['NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'FL', 'OH', 'WA', 'CO'][Math.floor(Math.random() * 10)]} ${Math.floor(Math.random() * 90000) + 10000}`,
    note: i % 5 === 0 ? 'VIP customer' : ''
  });
}

async function addDummyCustomers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow');
    console.log('Connected to MongoDB');

    await Customer.insertMany(dummyCustomers);
    console.log(`✅ Successfully added ${dummyCustomers.length} dummy customers`);

    process.exit(0);
  } catch (err) {
    console.error('Error adding dummy customers:', err);
    process.exit(1);
  }
}

addDummyCustomers();
