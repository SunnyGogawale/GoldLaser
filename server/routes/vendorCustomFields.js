const express = require('express')
const router = express.Router()
const VendorCustomField = require('../models/VendorCustomField')
const Vendor = require('../models/Vendor')
const { sendErrorResponse } = require('../utils/errorHandler')

// Get all custom fields
router.get('/', async (req, res) => {
  try {
    const fields = await VendorCustomField.find().sort({ createdAt: 1 })
    res.json(fields)
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendorCustomFields.list')
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendorCustomFields.create')
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendorCustomFields.rename')
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendorCustomFields.delete')
  }
})

module.exports = router
