const express = require('express')
const router = express.Router()
const VendorCustomField = require('../models/VendorCustomField')
const Vendor = require('../models/Vendor')

// Get all custom fields
router.get('/', async (req, res) => {
  try {
    const fields = await VendorCustomField.find().sort({ createdAt: 1 })
    res.json(fields)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// Add new custom field
router.post('/', async (req, res) => {
  try {
    const { fieldName, showInTable } = req.body

    const existingField = await VendorCustomField.findOne({ fieldName })
    if (existingField) {
      return res.status(400).json({ message: 'This field name already exists!' })
    }

    const customField = new VendorCustomField({
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
    
    const existingField = await VendorCustomField.findOne({ fieldName: newFieldName })
    if (existingField) {
      return res.status(400).json({ message: 'This field name already exists!' })
    }

    const updatedField = await VendorCustomField.findOneAndUpdate(
      { fieldName },
      { fieldName: newFieldName },
      { new: true }
    )
    
    if (!updatedField) {
      return res.status(404).json({ message: 'Custom field not found' })
    }

    // Update all existing vendors to rename the custom field
    const vendors = await Vendor.find({})
    for (const vendor of vendors) {
      if (vendor.customFields && vendor.customFields[fieldName] !== undefined) {
        vendor.customFields = {
          ...vendor.customFields,
          [newFieldName]: vendor.customFields[fieldName]
        }
        delete vendor.customFields[fieldName]
        await vendor.save()
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
    await VendorCustomField.findOneAndDelete({ fieldName })
    
    // Remove this custom field from all existing vendors
    const vendors = await Vendor.find({})
    for (const vendor of vendors) {
      if (vendor.customFields && vendor.customFields[fieldName] !== undefined) {
        delete vendor.customFields[fieldName]
        await vendor.save()
      }
    }
    
    res.json({ message: 'Custom field deleted successfully' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

module.exports = router
