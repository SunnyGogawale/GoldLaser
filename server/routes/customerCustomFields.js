const express = require('express')
const router = express.Router()
const CustomerCustomField = require('../models/CustomerCustomField')
const Customer = require('../models/Customer')
const CustomerFormSettings = require('../models/CustomerFormSettings')

// Get all custom fields
router.get('/', async (req, res) => {
  try {
    const fields = await CustomerCustomField.find().sort({ createdAt: 1 })
    res.json(fields)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Add new custom field
router.post('/', async (req, res) => {
  try {
    const { fieldName, showInTable } = req.body

    const existingField = await CustomerCustomField.findOne({ fieldName })
    if (existingField) {
      return res.status(400).json({ message: 'This field name already exists!' })
    }

    const customField = new CustomerCustomField({
      fieldName,
      showInTable
    })

    await customField.save()
    res.status(201).json(customField)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Rename custom field
router.put('/:fieldName', async (req, res) => {
  try {
    const { fieldName } = req.params
    const { newFieldName } = req.body
    
    const existingField = await CustomerCustomField.findOne({ fieldName: newFieldName })
    if (existingField) {
      return res.status(400).json({ message: 'This field name already exists!' })
    }

    const updatedField = await CustomerCustomField.findOneAndUpdate(
      { fieldName },
      { fieldName: newFieldName },
      { new: true }
    )
    
    if (!updatedField) {
      return res.status(404).json({ message: 'Custom field not found' })
    }

    // Update all existing customers to rename the custom field
    const customers = await Customer.find({})
    for (const customer of customers) {
      if (customer.customFields && customer.customFields[fieldName] !== undefined) {
        customer.customFields = {
          ...customer.customFields,
          [newFieldName]: customer.customFields[fieldName]
        }
        delete customer.customFields[fieldName]
        await customer.save()
      }
    }

    res.json(updatedField)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Delete custom field
router.delete('/:fieldName', async (req, res) => {
  try {
    const { fieldName } = req.params
    
    // Delete the custom field definition
    await CustomerCustomField.findOneAndDelete({ fieldName })
    
    // Remove this custom field from all existing customers
    const customers = await Customer.find({})
    for (const customer of customers) {
      if (customer.customFields && customer.customFields[fieldName] !== undefined) {
        delete customer.customFields[fieldName]
        await customer.save()
      }
    }
    
    res.json({ message: 'Custom field deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Get customer form field order
router.get('/field-order', async (req, res) => {
  try {
    const settings = await CustomerFormSettings.getSettings()
    res.json({ fieldOrder: settings.fieldOrder })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Update customer form field order (admin only)
router.put('/field-order', async (req, res) => {
  try {
    const { fieldOrder } = req.body
    if (!Array.isArray(fieldOrder)) {
      return res.status(400).json({ message: 'fieldOrder must be an array' })
    }
    let settings = await CustomerFormSettings.getSettings()
    settings.fieldOrder = fieldOrder
    await settings.save()
    res.json({ fieldOrder: settings.fieldOrder })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router