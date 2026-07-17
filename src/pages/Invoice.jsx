import React, { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info, Eye, MoreVertical, Plus, UploadCloud, FileText, Image as ImageIcon, MoreHorizontal, Download } from 'lucide-react';
import EmptyDataCard from '../components/EmptyDataCard';
import { getAuthToken, getAuthValue } from '../utils/authStorage';
import { readJsonResponse } from '../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import MotionButton from '../components/MotionButton'
import ActionMenuPortal from '../components/ActionMenuPortal'
import { getActionDropdownPosition } from '../utils/dropdownPosition'
import { handleApiError, showSuccessToast, showErrorToast } from '../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');
const API_URL = `${API_BASE_URL}/api/invoices`;
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`;
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`;
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf';
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf'
]);
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf']);

const isAllowedAttachmentFile = (file) => {
  const fileType = String(file?.type || '').toLowerCase();
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(fileType)) return true;

  const fileName = String(file?.name || '');
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(extension);
};

const getAttachmentMimeType = (attachment) => {
  const fileType = String(attachment?.type || '').toLowerCase();
  if (fileType) return fileType;

  const dataUrl = String(attachment?.dataUrl || '');
  const mimeMatch = dataUrl.match(/^data:([^;]+);/i);
  return String(mimeMatch?.[1] || '').toLowerCase();
};

const isImageAttachment = (attachment) => getAttachmentMimeType(attachment).startsWith('image/');

const isPdfAttachment = (attachment) => getAttachmentMimeType(attachment) === 'application/pdf';

const getAttachmentMenuItems = (attachments = []) => {
  let imageIndex = 0;
  let pdfIndex = 0;
  let attachmentIndex = 0;

  return attachments
    .filter((attachment) => attachment?.dataUrl)
    .map((attachment) => {
      if (isImageAttachment(attachment)) {
        imageIndex += 1;
        return { attachment, label: `Image ${imageIndex}` };
      }

      if (isPdfAttachment(attachment)) {
        pdfIndex += 1;
        return { attachment, label: `PDF ${pdfIndex}` };
      }

      attachmentIndex += 1;
      return { attachment, label: `Attachment ${attachmentIndex}` };
    });
};

function Invoice() {
  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [companySettings, setCompanySettings] = useState({
    companyName: '',
    companyAddress: '',
    companyEmail: '',
    companyContactNumber: '',
    bankDetails: {
      bankName: '',
      bankAddress: '',
      accountNumber: '',
      ifscCode: ''
    }
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch company settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/company-settings`)
        if (res.ok) {
          const data = await res.json()
          setCompanySettings(data.settings)
        }
      } catch (err) {
        console.error('Error fetching company settings:', err)
      }
    }
    fetchSettings()
  }, [])

  // Invoice form state
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    clientId: '',
    clientType: 'Customer',
    invoiceDate: new Date().toISOString().split('T')[0],
    transactionDescription: '',
    items: [
      { product: '', description: '', amount: 0 }
    ],
    attachments: [],
    totalAmount: 0
  });

  // Validation errors state
  const [errors, setErrors] = useState({});
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [isAttachmentDragging, setIsAttachmentDragging] = useState(false);

  // Edit mode state
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  // Invoices list state
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin';
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoInvoice, setInfoInvoice] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoNowMs, setInfoNowMs] = useState(0);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownInvoice, setDropdownInvoice] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [dropdownUp, setDropdownUp] = useState(false);
  const [attachmentsMenuOpen, setAttachmentsMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('invoice.pdf');
  const [attachmentViewerOpen, setAttachmentViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
        setDropdownInvoice(null);
        setAttachmentsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownId]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const getClientDisplayLabel = (client) => {
    const baseName =
      client?.customerName ||
      client?.vendorName ||
      `${client?.firstName || ''} ${client?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
      'Unknown';
    const withCompany = client?.companyName ? `${baseName} - ${client.companyName}` : baseName;
    return client?.id ? `${withCompany}` : withCompany;
  };

  const formatTimeAgo = (dateValue) => {
    const d = dateValue ? new Date(dateValue) : null
    if (!d || Number.isNaN(d.getTime())) return ''
    if (!infoNowMs) return ''
    const diffMs = infoNowMs - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 10) return 'just now'
    if (diffSec < 60) return `${diffSec} seconds ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} minutes ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr} hours ago`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay} days ago`
  }

  const truncateText = (value, max = 15) => {
    const s = String(value ?? '')
    if (s.length <= max) return s
    return s.slice(0, max) + '...'
  }

  const truncateTextByChars = (value, maxChars = 30) => {
    const s = String(value ?? '').trim()
    if (!s) return ''
    if (s.length <= maxChars) return s
    return `${s.slice(0, maxChars)}...`
  }

  const formatDateDDMMMYYYY = (dateValue) => {
    if (!dateValue) return '-'
    const d = new Date(dateValue)
    if (!d || Number.isNaN(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const mmm = months[d.getMonth()] || ''
    const yyyy = d.getFullYear()
    return `${dd}-${mmm}-${yyyy}`
  }

  const formatFileSize = (sizeBytes) => {
    const size = Number(sizeBytes || 0)
    if (!size || Number.isNaN(size)) return '-'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }

  // Customer dropdown autocomplete state
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Only use customers
  const allCustomers = customers.map(c => ({
    ...c,
    type: 'Customer',
    name: c.customerName,
    companyName: c.companyName,
    displayName: c.companyName
      ? `${c.customerName} - ${c.companyName}`
      : c.customerName
  }));

  const filteredCustomers = allCustomers.filter(c =>
    c.name?.toLowerCase().includes(customerSearchText.toLowerCase()) ||
    c.companyName?.toLowerCase().includes(customerSearchText.toLowerCase()) ||
    c.id?.toLowerCase().includes(customerSearchText.toLowerCase())
  );

  // Fetch vendors for dropdown
  const fetchVendorsList = async () => {
    try {
      const response = await fetch(`${VENDORS_API_URL}?limit=1000`); // Get all for dropdown
      const data = await readJsonResponse(response, 'Error fetching vendors');
      setVendors(data.vendors || []);
    } catch (err) {
      handleApiError(err, 'Error fetching vendors');
    }
  };

  // Fetch next invoice number
  const fetchNextInvoiceNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/next-number`);
      const data = await readJsonResponse(response, 'Error fetching next invoice number');
      setInvoiceForm(prev => ({ ...prev, invoiceNumber: data.nextNumber }));
    } catch (err) {
      handleApiError(err, 'Error fetching next invoice number');
    }
  };

  // Fetch customers for dropdown
  const fetchCustomersList = async () => {
    try {
      const response = await fetch(`${CUSTOMERS_API_URL}?limit=1000`); // Get all for dropdown
      const data = await readJsonResponse(response, 'Error fetching customers');
      setCustomers(data.customers || []);
    } catch (err) {
      handleApiError(err, 'Error fetching customers');
    }
  };

  // Fetch invoices on component mount
  const fetchInvoices = async (page = 1, search = searchQuery, column = sortColumn, order = sortOrder) => {
    setLoading(true);
    try {
      let url = `${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`;
      if (column) {
        url += `&sortColumn=${encodeURIComponent(column)}&sortOrder=${encodeURIComponent(order)}`;
      }
      const response = await fetch(url);
      const data = await readJsonResponse(response, 'Error fetching invoices');
      setInvoices(data.invoices || []);
      setTotalPages(data.totalPages || 0);
      setCurrentPage(page);
    } catch (err) {
      handleApiError(err, 'Error fetching invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset to page 1 when search query or sort changes
    fetchInvoices(1, searchQuery, sortColumn, sortOrder);
  }, [searchQuery, sortColumn, sortOrder]);

  useEffect(() => {
    fetchCustomersList();
    fetchVendorsList();
    fetchNextInvoiceNumber();
  }, []);

  // Calculate total amount whenever items change
  useEffect(() => {
    const total = invoiceForm.items.reduce((sum, item) => {
      const amount = parseFloat(item.amount) || 0;
      return sum + amount;
    }, 0);

    setInvoiceForm(prev => ({ ...prev, totalAmount: total }));
  }, [invoiceForm.items]);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    if (!invoiceForm.clientId) {
      newErrors.clientId = 'Please select a client';
    }

    if (!invoiceForm.invoiceDate) {
      newErrors.invoiceDate = 'Invoice date is required';
    }

    if (invoiceForm.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }

    const itemErrors = [];
    let hasItemErrors = false;

    invoiceForm.items.forEach((item, index) => {
      const itemError = {};
      if (!item.product.trim()) {
        itemError.product = 'Product name is required';
        hasItemErrors = true;
      }
      if (item.amount < 0 || item.amount === '') {
        itemError.amount = 'Valid amount is required';
        hasItemErrors = true;
      }
      itemErrors[index] = itemError;
    });

    if (hasItemErrors) {
      newErrors.itemErrors = itemErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceForm(prev => ({
      ...prev,
      [name]: value
    }));

    if (formSubmitted && errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: value };

    setInvoiceForm(prev => ({
      ...prev,
      items: newItems
    }));
  };

  const addItemRow = () => {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { product: '', description: '', amount: 0 }]
    }));
  };

  const removeItemRow = (index) => {
    if (invoiceForm.items.length > 1) {
      const newItems = invoiceForm.items.filter((_, i) => i !== index);
      setInvoiceForm(prev => ({
        ...prev,
        items: newItems
      }));
    }
  };

  const handleAttachmentChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const currentAttachments = Array.isArray(invoiceForm.attachments) ? invoiceForm.attachments : [];
    const remainingSlots = Math.max(0, 5 - currentAttachments.length);

    if (remainingSlots === 0) {
      setAttachmentError('You can upload up to 5 files only.');
      event.target.value = '';
      return;
    }

    const supportedFiles = files.filter(isAllowedAttachmentFile);
    const sizeAllowedFiles = supportedFiles.filter((file) => Number(file?.size || 0) <= MAX_ATTACHMENT_SIZE_BYTES);
    const selectedFiles = sizeAllowedFiles.slice(0, remainingSlots);
    const hasUnsupportedFiles = supportedFiles.length !== files.length;
    const hasOversizedFiles = sizeAllowedFiles.length !== supportedFiles.length;

    if (selectedFiles.length === 0) {
      const blockingMessages = [];
      if (hasUnsupportedFiles) {
        blockingMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.');
      }
      if (hasOversizedFiles) {
        blockingMessages.push('Each uploaded file must be 25 MB or smaller.');
      }
      setAttachmentError(blockingMessages.join(' ') || 'No valid files were selected.');
      event.target.value = '';
      return;
    }

    const errorMessages = [];
    if (hasUnsupportedFiles) {
      errorMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.');
    }
    if (hasOversizedFiles) {
      errorMessages.push('Each uploaded file must be 25 MB or smaller.');
    }
    if (sizeAllowedFiles.length > remainingSlots) {
      errorMessages.push('Only 5 files are allowed. Extra files were ignored.');
    }
    setAttachmentError(errorMessages.join(' '));

    const toDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || '') });
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`));
      reader.readAsDataURL(file);
    });

    try {
      const attachments = await Promise.all(selectedFiles.map(toDataUrl));
      setInvoiceForm(prev => ({
        ...prev,
        attachments: [...(Array.isArray(prev.attachments) ? prev.attachments : []), ...attachments]
      }));
    } catch (err) {
      handleApiError(err, 'Error reading attachment files');
      setAttachmentError('Could not read one or more photos.');
    } finally {
      event.target.value = '';
    }
  };

  const handleAttachmentDrop = async (event) => {
    event.preventDefault();
    setIsAttachmentDragging(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length === 0) return;

    const currentAttachments = Array.isArray(invoiceForm.attachments) ? invoiceForm.attachments : [];
    const remainingSlots = Math.max(0, 5 - currentAttachments.length);

    if (remainingSlots === 0) {
      setAttachmentError('You can upload up to 5 files only.');
      return;
    }

    const supportedFiles = files.filter(isAllowedAttachmentFile);
    const sizeAllowedFiles = supportedFiles.filter((file) => Number(file?.size || 0) <= MAX_ATTACHMENT_SIZE_BYTES);
    const selectedFiles = sizeAllowedFiles.slice(0, remainingSlots);
    const hasUnsupportedFiles = supportedFiles.length !== files.length;
    const hasOversizedFiles = sizeAllowedFiles.length !== supportedFiles.length;

    if (selectedFiles.length === 0) {
      const blockingMessages = [];
      if (hasUnsupportedFiles) {
        blockingMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.');
      }
      if (hasOversizedFiles) {
        blockingMessages.push('Each uploaded file must be 25 MB or smaller.');
      }
      setAttachmentError(blockingMessages.join(' ') || 'No valid files were selected.');
      return;
    }

    const errorMessages = [];
    if (hasUnsupportedFiles) {
      errorMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.');
    }
    if (hasOversizedFiles) {
      errorMessages.push('Each uploaded file must be 25 MB or smaller.');
    }
    if (sizeAllowedFiles.length > remainingSlots) {
      errorMessages.push('Only 5 files are allowed. Extra files were ignored.');
    }
    setAttachmentError(errorMessages.join(' '));

    const toDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || '') });
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`));
      reader.readAsDataURL(file);
    });

    try {
      const attachments = await Promise.all(selectedFiles.map(toDataUrl));
      setInvoiceForm(prev => ({
        ...prev,
        attachments: [...(Array.isArray(prev.attachments) ? prev.attachments : []), ...attachments]
      }));
    } catch (err) {
      handleApiError(err, 'Error reading attachment files');
      setAttachmentError('Could not read one or more photos.');
    }
  };

  const handleAttachmentDragOver = (event) => {
    event.preventDefault();
    if (!loading) setIsAttachmentDragging(true);
  };

  const handleAttachmentDragLeave = (event) => {
    event.preventDefault();
    setIsAttachmentDragging(false);
  };

  const removeAttachment = (index) => {
    setInvoiceForm(prev => ({
      ...prev,
      attachments: (Array.isArray(prev.attachments) ? prev.attachments : []).filter((_, i) => i !== index)
    }));
    setAttachmentError('');
  };

  const handleInvoiceSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const token = getAuthToken();
      if (editingInvoiceId) {
        // Update existing invoice
        const response = await fetch(`${API_URL}/${editingInvoiceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(invoiceForm)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error updating invoice');
        }

        setEditingInvoiceId(null);
        showSuccessToast('Invoice updated successfully!');
      } else {
        // Add new invoice
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(invoiceForm)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error saving invoice');
        }

        showSuccessToast('Invoice created successfully!');
      }

      // Reset form immediately after success
      setInvoiceForm({
        invoiceNumber: '',
        clientId: '',
        clientType: 'Customer',
        invoiceDate: new Date().toISOString().split('T')[0],
        transactionDescription: '',
        items: [{ product: '', description: '', amount: 0 }],
        attachments: [],
        totalAmount: 0
      });
      setCustomerSearchText('');
      setAttachmentError('');
      setErrors({});
      setFormSubmitted(false);
      setFormOpen(false);

      // Fetch latest data in background, don't fail if this errors
      try {
        await fetchInvoices(1);
        await fetchNextInvoiceNumber();
      } catch (fetchErr) {
        // Silent fail for background refresh - user has already seen success message
        console.error('Error refreshing invoice list:', fetchErr);
      }
    } catch (err) {
      handleApiError(err, 'Error saving invoice');
    } finally {
      setLoading(false);
    }
  };

  const openInfo = async (invoice) => {
    setInfoOpen(true);
    setInfoInvoice(invoice || null);
    const id = invoice?._id;
    if (!id) return;
    setInfoLoading(true);
    setInfoNowMs(Date.now());
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/detail/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await readJsonResponse(response, 'Error fetching invoice info');
      setInfoInvoice(data || null);
    } catch (err) {
      handleApiError(err, 'Error fetching invoice info');
    } finally {
      setInfoLoading(false);
    }
  };

  const refreshInfo = async () => {
    const id = infoInvoice?._id;
    if (!id) return;
    setInfoLoading(true);
    setInfoNowMs(Date.now());
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/detail/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await readJsonResponse(response, 'Error refreshing invoice info');
      setInfoInvoice(data || null);
    } catch (err) {
      handleApiError(err, 'Error refreshing invoice info');
    } finally {
      setInfoLoading(false);
    }
  };

  const closeInfo = () => {
    setInfoOpen(false);
    setInfoInvoice(null);
  };

  const handleEditInvoice = (invoice) => {
    const clientType = invoice.clientType || 'Customer';
    const clientId = invoice.clientId || invoice.vendorId?._id || invoice.vendorId;
    let clientName = '';
    let clientIdStr = '';
    let displayName = '';

    if (clientType === 'Customer') {
      const customer = customers.find(c => String(c._id) === String(clientId));
      if (customer) {
        clientName = customer.customerName;
        // clientIdStr = customer.id;
        displayName = customer.companyName ? `${customer.customerName} - ${customer.companyName}` : customer.customerName;
      }
    } else {
      const client = invoice.vendorId;
      clientName = client?.customerName || client?.vendorName || '';
      // clientIdStr = client?.id || '';
      displayName = clientName;
    }

    setInvoiceForm({
      invoiceNumber: invoice.invoiceNumber,
      clientId: clientId,
      clientType: clientType,
      invoiceDate: new Date(invoice.invoiceDate).toISOString().split('T')[0],
      transactionDescription: invoice.transactionDescription || '',
      items: invoice.items.map(item => ({
        product: item.product,
        description: item.description,
        amount: item.amount
      })),
      attachments: Array.isArray(invoice.attachments) ? invoice.attachments : [],
      totalAmount: invoice.totalAmount
    });
    setCustomerSearchText(displayName ? `${displayName} (${clientIdStr})` : '');
    setEditingInvoiceId(invoice._id);
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(true);
  };

  const handleCancelEdit = async () => {
    setEditingInvoiceId(null);
    setInvoiceForm({
      invoiceNumber: '',
      clientId: '',
      clientType: 'Customer',
      invoiceDate: new Date().toISOString().split('T')[0],
      transactionDescription: '',
      items: [{ product: '', description: '', amount: 0 }],
      attachments: [],
      totalAmount: 0
    });
    setCustomerSearchText('');
    setAttachmentError('');
    await fetchNextInvoiceNumber();
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(false);
  };

  const openCreateInvoice = async () => {
    if (loading) return;
    setEditingInvoiceId(null);
    setInvoiceForm({
      invoiceNumber: '',
      clientId: '',
      clientType: 'Customer',
      invoiceDate: new Date().toISOString().split('T')[0],
      transactionDescription: '',
      items: [{ product: '', description: '', amount: 0 }],
      attachments: [],
      totalAmount: 0
    });
    setCustomerSearchText('');
    setIsCustomerDropdownOpen(false);
    setAttachmentError('');
    await fetchNextInvoiceNumber();
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(true);
  };

  const closeInvoiceForm = () => {
    if (loading) return;
    setFormOpen(false);
  };

  const generateInvoicePDF = (invoice) => {
    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4',
      compress: true
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 15;
    const marginRight = 15;
    let y = 20;

    // --- Header ---
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0); // Black border
    doc.setFillColor(255, 255, 255);
    doc.setTextColor(0, 0, 0);

    // --- Top Section (Company Info & Logo) ---
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', marginLeft, y);

    // Company Info (Left)
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings.companyName || 'Company Name', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings.companyAddress || 'Company Address', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings.companyEmail || 'Email', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings.companyContactNumber || 'Contact No', marginLeft, y);

    // Logo Placeholder (Right)
    const logoX = pageWidth - marginRight - 50;
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0);
    doc.rect(logoX, 20, 50, 30); // Logo box
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Company', logoX + 25, 32, { align: 'center' });
    doc.text('Logo', logoX + 25, 42, { align: 'center' });

    // --- Bill To Section ---
    y = 65;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', marginLeft, y);
    y += 6;
    const client = invoice.vendorId;
    const isCustomer = client?.customerName;

    const rightColX = pageWidth - marginRight - 80;
    // Customer/Vendor Name
    doc.setFont('helvetica', 'bold');
    doc.text('Name:', marginLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(isCustomer ? client.customerName : (client?.vendorName || 'N/A'), marginLeft + 20, y);

    // Email in the same row on the right
    if (isCustomer && client.email || !isCustomer && client?.email) {
      doc.setFont('helvetica', 'bold');
      doc.text('Email:', rightColX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(isCustomer ? client.email : (client?.email || ''), rightColX + 15, y);
    }
    y += 5;

    if (isCustomer) {
      // Display customer details with bold titles
      let hasCompanyOrPhone = false;
      if (client.companyName) {
        doc.setFont('helvetica', 'bold');
        doc.text('Company:', marginLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.companyName, marginLeft + 20, y);
        hasCompanyOrPhone = true;
      }
      if (client.contactNumber) {
        doc.setFont('helvetica', 'bold');
        doc.text('Phone:', rightColX, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.contactNumber, rightColX + 15, y);
        hasCompanyOrPhone = true;
      }
      if (hasCompanyOrPhone) y += 5;

      if (client.address) {
        doc.setFont('helvetica', 'bold');
        doc.text('Address:', marginLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.address, marginLeft + 20, y);
        y += 5;
      }

      if (client.alternateNumber) {
        doc.setFont('helvetica', 'bold');
        doc.text('Alt:', marginLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.alternateNumber, marginLeft + 10, y);
        y += 5;
      }
    } else {
      // Display vendor details with bold titles
      let hasCompanyOrPhone = false;
      if (client?.companyName) {
        doc.setFont('helvetica', 'bold');
        doc.text('Company:', marginLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.companyName, marginLeft + 20, y);
        hasCompanyOrPhone = true;
      }
      if (client?.contactNumber) {
        doc.setFont('helvetica', 'bold');
        doc.text('Phone:', rightColX, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.contactNumber, rightColX + 10, y);
        hasCompanyOrPhone = true;
      }
      if (hasCompanyOrPhone) y += 5;

      if (client?.address) {
        doc.setFont('helvetica', 'bold');
        doc.text('Address:', marginLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.address, marginLeft + 20, y);
        y += 5;
      }
    }

    // --- Invoice Details ---
    y += 5; // Add space before invoice details
    doc.setLineWidth(0.3);
    doc.setDrawColor(150, 150, 150);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice details', marginLeft, y);

    const invoiceNo = invoice.invoiceNumber || 'SI00001';
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const invoiceDate = invoice.invoiceDate
      ? formatDate(invoice.invoiceDate)
      : '05-Nov-2026';

    // Invoice No
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice No:', marginLeft, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceNo, marginLeft + 25, y + 6);

    // Invoice Date on next line
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Date:', marginLeft, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceDate, marginLeft + 25, y + 6);

    // --- Items Table ---
    y += 15;
    const items = invoice.items || [];
    const tableData = items.map((item, idx) => [
      idx + 1,
      item.product?.toString().trim() || '-',
      item.description?.toString().trim() || '-',
      `${(parseFloat(item.amount) || 0).toLocaleString('en-IN')}/-`
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Sr No', 'Product', 'Description', 'Amount']],
      body: tableData,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 45, halign: 'left' },
        2: { cellWidth: 90, halign: 'left' },
        3: { cellWidth: 35, halign: 'right' }
      }
    });

    // --- Total ---
    const finalY = doc.lastAutoTable?.finalY || y + 40;
    y = finalY + 5;
    const totalAmt = parseFloat(invoice.totalAmount) || 0;
    const totalAmtStr = totalAmt.toLocaleString('en-IN');

    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Total', pageWidth - marginRight - 60, y);
    doc.text(`${totalAmtStr}/-`, pageWidth - marginRight, y, { align: 'right' });

    // --- Company Footer ---
    y += 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings.companyName || 'Company Name', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings.companyAddress || 'Company Address', marginLeft, y);

    // --- Bank Details ---
    y += 20;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bank Details', marginLeft, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings.bankDetails?.bankName || 'Bank Name', marginLeft, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings.bankDetails?.bankAddress || 'Bank Address', marginLeft, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(companySettings.bankDetails?.accountNumber || 'A/c Number', marginLeft, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.text(companySettings.bankDetails?.ifscCode || 'IFSC Code', marginLeft, y);

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    setPdfFileName(`invoice_${invoice.invoiceNumber || 'unknown'}.pdf`);
    setPdfViewerOpen(true);
  };

  const handleDownloadPdf = () => {
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = pdfFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const closeActionDropdown = () => {
    setOpenDropdownId(null);
    setDropdownInvoice(null);
    setAttachmentsMenuOpen(false);
  };

  const openAttachmentPreview = (attachment) => {
    setSelectedAttachment(attachment);
    setAttachmentViewerOpen(true);
    closeActionDropdown();
  };

  const closeAttachmentPreview = () => {
    setAttachmentViewerOpen(false);
    setSelectedAttachment(null);
  };

  const openAttachmentPicker = () => {
    if (loading || (invoiceForm.attachments?.length || 0) >= 5) return;
    attachmentInputRef.current?.click();
  };

  const handleDeleteInvoice = async (id) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error deleting invoice');
        }
        await fetchInvoices(currentPage);
        showSuccessToast('Invoice deleted successfully!');
        return true;
      } catch (err) {
        handleApiError(err, 'Error deleting invoice');
        return false;
      }
    }

    return false;
  };

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
        <MotionButton
          type="button"
          onClick={openCreateInvoice}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9375rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading ? 0.7 : 1
          }}
        >
          Add Invoice
        </MotionButton>
      </div>

      {formOpen && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeInvoiceForm()
            }}
          >
            <div
              className="card"
              style={{
                width: 'min(1100px, 96vw)',
                maxHeight: '88vh',
                overflow: 'auto',
                padding: '1.5rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>
                  {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
                  <div
                    style={{
                      padding: '0.4rem 0.75rem',
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      background: 'var(--bg-main)',
                      color: 'var(--text-muted)',
                      fontSize: '0.875rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Invoice No : {invoiceForm.invoiceNumber || 'xxxx'}
                  </div>
                  <MotionButton
                    type="button"
                    onClick={closeInvoiceForm}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.5rem 1rem',
                      // background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      // border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    <X size={16} />
                    {/* Close */}
                  </MotionButton>
                </div>
              </div>

              <form onSubmit={handleInvoiceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 280px', position: 'relative' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                      Select Customer <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search customer..."
                        value={customerSearchText}
                        onChange={(e) => {
                          setCustomerSearchText(e.target.value);
                          setIsCustomerDropdownOpen(e.target.value.length > 0);
                          if (invoiceForm.clientId) {
                            setInvoiceForm(prev => ({ ...prev, clientId: '', clientType: 'Customer' }));
                          }
                          if (formSubmitted && errors.clientId) {
                            setErrors(prev => {
                              const newE = { ...prev };
                              delete newE.clientId;
                              return newE;
                            });
                          }
                        }}
                        onFocus={(e) => {
                          if (e.target.value.length > 0) setIsCustomerDropdownOpen(true);
                        }}
                        onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)}
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: `1px solid ${errors.clientId ? 'var(--danger)' : 'var(--border)'}`,
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          background: 'var(--bg-card)',
                          color: 'var(--text-header)',
                          outline: 'none'
                        }}
                      />
                      {isCustomerDropdownOpen && (
                        <ul style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          maxHeight: '250px',
                          overflowY: 'auto',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          marginTop: '4px',
                          padding: 0,
                          listStyle: 'none',
                          zIndex: 10,
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}>
                          {filteredCustomers.map(customer => (
                            <li
                              key={customer._id + customer.type}
                              onClick={() => {
                                setInvoiceForm(prev => ({ ...prev, clientId: customer._id, clientType: customer.type }))
                                setCustomerSearchText(`${customer.displayName}`)
                                setIsCustomerDropdownOpen(false)
                              }}
                              style={{
                                padding: '0.5rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                color: 'var(--text-header)',
                                borderBottom: '1px solid var(--border)',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => e.target.style.background = 'var(--bg-main)'}
                              onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            >
                              {customer.displayName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {formSubmitted && errors.clientId && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.clientId}</p>
                    )}
                  </div>

                  <div style={{ flex: '1 1 280px' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                      Invoice Date <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      type="date"
                      name="invoiceDate"
                      value={invoiceForm.invoiceDate}
                      onChange={handleInputChange}
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: `1px solid ${errors.invoiceDate ? 'var(--danger)' : 'var(--border)'}`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)'
                      }}
                    />
                    {formSubmitted && errors.invoiceDate && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.invoiceDate}</p>
                    )}
                  </div>

                  <div style={{ flex: '1 1 280px' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                      Transaction Description
                    </label>
                    <input
                      type="text"
                      name="transactionDescription"
                      value={invoiceForm.transactionDescription}
                      onChange={handleInputChange}
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-header)' }}>Invoice Items</h3>
                    <MotionButton
                      type="button"
                      onClick={addItemRow}
                      disabled={loading}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: 'transparent',
                        color: 'var(--text-header)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.875rem'
                      }}
                    >
                      <Plus size={14} /> Add Row
                    </MotionButton>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead style={{ background: 'var(--bg-main)' }}>
                        <tr>
                          <th style={{ padding: '0.5rem', textAlign: 'center', width: '50px' }}>Sr No</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Product</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right', width: '120px' }}>Amount (₹)</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceForm.items.map((item, index) => (
                          <tr key={index} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>{index + 1}</td>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                type="text"
                                value={item.product}
                                onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                                placeholder="Enter product name"
                                style={{
                                  width: '100%',
                                  padding: '0.25rem 0.5rem',
                                  border: `1px solid ${formSubmitted && errors.itemErrors?.[index]?.product ? 'var(--danger)' : 'transparent'}`,
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  color: 'var(--text-header)',
                                  fontSize: '0.875rem'
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                placeholder="Enter description"
                                style={{
                                  width: '100%',
                                  padding: '0.25rem 0.5rem',
                                  border: '1px solid transparent',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  color: 'var(--text-header)',
                                  fontSize: '0.875rem'
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                type="number"
                                value={item.amount}
                                onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                                min="0"
                                step="0.01"
                                style={{
                                  width: '100%',
                                  padding: '0.25rem 0.5rem',
                                  border: `1px solid ${formSubmitted && errors.itemErrors?.[index]?.amount ? 'var(--danger)' : 'transparent'}`,
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  color: 'var(--text-header)',
                                  textAlign: 'right',
                                  fontSize: '0.875rem'
                                }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <MotionButton
                                type="button"
                                onClick={() => removeItemRow(index)}
                                disabled={invoiceForm.items.length === 1}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: invoiceForm.items.length === 1 ? 'var(--text-muted)' : 'var(--danger)',
                                  cursor: invoiceForm.items.length === 1 ? 'not-allowed' : 'pointer',
                                  padding: '0.25rem'
                                }}
                              >
                                <Trash2 size={16} />
                              </MotionButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {formSubmitted && errors.items && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.items}</p>
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-header)' }}>File Attachment</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Max 5 files</div>
                  </div>
                  <div
                    onDrop={handleAttachmentDrop}
                    onDragOver={handleAttachmentDragOver}
                    onDragLeave={handleAttachmentDragLeave}
                    style={{
                      border: `2px dashed ${isAttachmentDragging ? 'var(--primary)' : 'rgba(209, 213, 219, 0.95)'}`,
                      borderRadius: '16px',
                      padding: '2rem 1rem',
                      background: isAttachmentDragging ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card)',
                      minHeight: '220px',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      ref={attachmentInputRef}
                      id="invoice-attachment-input"
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      multiple
                      onChange={handleAttachmentChange}
                      disabled={loading || (Array.isArray(invoiceForm.attachments) && invoiceForm.attachments.length >= 5)}
                      style={{ display: 'none' }}
                    />
                    {(invoiceForm.attachments?.length || 0) < 5 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.55rem',
                          textAlign: 'center'
                        }}
                      >
                        {!invoiceForm.attachments?.length && (
                          <>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-header)' }}>
                              Upload File
                            </div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.45, maxWidth: '420px' }}>
                              Drag and drop files here or click to upload
                            </div>
                            <div style={{
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)'
                            }}>
                              Supported formats: JPEG, JPG, PNG, GIF, WebP, SVG, PDF up to 25 MB each
                            </div>
                          </>
                        )}
                        <MotionButton
                          type="button"
                          onClick={openAttachmentPicker}
                          disabled={loading}
                          style={{
                          marginTop: '0.35rem',
                          padding: '0.55rem 1.2rem',
                          borderRadius: '10px',
                          background: 'linear-gradient(180deg, #4c7cf0 0%, #315be0 100%)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          boxShadow: '0 10px 20px rgba(49, 91, 224, 0.22)',
                          border: 'none',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          opacity: loading ? 0.7 : 1
                        }}
                        >
                          Browse Files
                        </MotionButton>
                      </div>
                    )}
                    <div style={{ marginTop: '0.9rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {invoiceForm.attachments?.length || 0}/5 selected
                    </div>
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {(invoiceForm.attachments || []).map((attachment, index) => (
                        <div
                          key={`${attachment.name}-${index}`}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: '14px',
                            background: 'var(--bg-card)',
                            padding: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                          }}
                        >
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-main)',
                            display: 'grid',
                            placeItems: 'center',
                            color: 'var(--text-muted)',
                            flex: '0 0 auto'
                          }}>
                            {String(attachment.type || '').startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-header)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attachment.name}>
                              {attachment.name}
                            </div>
                            <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              {formatFileSize(attachment.size)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '0 0 auto' }}>
                            <button
                              type="button"
                              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
                              title="More"
                            >
                              <MoreHorizontal size={20} />
                            </button>
                            <a
                              href={attachment.dataUrl}
                              download={attachment.name}
                              style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}
                              title="Download"
                            >
                              <Download size={18} />
                            </a>
                            <button
                              type="button"
                              onClick={() => removeAttachment(index)}
                              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
                              title="Remove file"
                            >
                              <X size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {attachmentError && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{attachmentError}</p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{
                    background: 'var(--primary-light, #eef2ff)',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '6px',
                    border: '1px solid var(--primary-border, #c7d2fe)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-header)' }}>Total Amount:</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                      ₹{invoiceForm.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {!editingInvoiceId && (
                      <MotionButton
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={loading}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'var(--bg-main)',
                          color: 'var(--text-header)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <RotateCcw size={14} /> Reset
                      </MotionButton>
                    )}
                    <MotionButton
                      type="submit"
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <Save size={14} />
                      {loading ? 'Saving...' : editingInvoiceId ? 'Update Invoice' : 'Save Invoice'}
                    </MotionButton>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </ActionMenuPortal>
      )}

      {/* Invoice List */}
      {(
        <div className="card" style={{ margin: '0 auto 0', width: '100%', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>Invoice List</h2>

            {/* Search Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.35rem 0.6rem',
              width: 'min(420px, 100%)',
              flex: '0 0 auto',
              marginLeft: 'auto'
            }}>
              <Search size={14} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />
              <input
                type="text"
                placeholder="Search by invoice no or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.8125rem',
                  color: 'var(--text-header)'
                }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              {/* Mobile/Tablet Card View */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {invoices.map((invoice) => {
                    const label = getClientDisplayLabel(invoice.vendorId)

                    return (
                      <div
                        key={invoice._id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '0.75rem',
                          background: 'var(--bg-card)',
                          boxShadow: 'inset 0 -1px 0 rgba(15, 23, 42, 0.08)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '1rem',
                              fontWeight: 800,
                              color: 'var(--text-header)',
                              marginBottom: '0.25rem'
                            }}>
                              {invoice.invoiceNumber || '-'}
                            </div>
                            <div style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-muted)',
                              fontWeight: 600,
                              whiteSpace: 'normal',
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word'
                            }}>
                              {label}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}>
                            <MotionButton
                              onClick={async (e) => {
                                e.stopPropagation();
                                await handleDeleteInvoice(invoice._id);
                              }}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--danger)',
                                transition: 'all 0.2s'
                              }}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </MotionButton>
                            <MotionButton
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openDropdownId === invoice._id) {
                                  closeActionDropdown();
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                    rect,
                                    dropdownHeight: 280
                                  });
                                  setDropdownPosition({ top, left });
                                  setDropdownUp(shouldOpenUp);
                                  setDropdownInvoice(invoice);
                                  setOpenDropdownId(invoice._id);
                                  setAttachmentsMenuOpen(false);
                                }
                              }}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                transition: 'all 0.2s'
                              }}
                              title="Actions"
                            >
                              <MoreVertical size={16} />
                            </MotionButton>

                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '64px' }}>Date:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{formatDateDDMMMYYYY(invoice.invoiceDate)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '64px' }}>Amount:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 800 }}>
                              ₹{invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          {invoice.transactionDescription && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '64px' }}>Note:</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600, whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                {truncateTextByChars(invoice.transactionDescription, 30)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Desktop Table View */
                <div style={{ overflowX: 'auto', border: isAdmin ? '1px solid var(--border)' : 'none', borderRadius: '10px' }}>
                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th
                          onClick={() => handleSort('invoiceNumber')}
                          style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}
                        >
                          INV No {sortColumn === 'invoiceNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('clientId')}
                          style={{ width: '20%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}
                        >
                          Customer Name {sortColumn === 'clientId' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('invoiceDate')}
                          style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}
                        >
                          Date {sortColumn === 'invoiceDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('transactionDescription')}
                          style={{ width: '30%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}
                        >
                          Description {sortColumn === 'transactionDescription' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('totalAmount')}
                          style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}
                        >
                          Amount {sortColumn === 'totalAmount' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-header)', fontWeight: 700, borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const label = getClientDisplayLabel(invoice.vendorId)

                        return (
                          <tr key={invoice._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-main)', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }} title={String(invoice.invoiceNumber || '')}>
                              {truncateText(invoice.invoiceNumber || '')}
                            </td>
                            <td
                              style={{
                                width: '20%',
                                textAlign: 'left',
                                padding: '0.35rem 0.35rem',
                                color: 'var(--text-main)',
                                borderRight: isAdmin ? '1px solid var(--border)' : 'none',
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word',
                                minWidth: '220px'
                              }}
                              title={String(label)}
                            >
                              {label || '-'}
                            </td>
                            <td style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-main)', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }} title={invoice.invoiceDate ? formatDateDDMMMYYYY(invoice.invoiceDate) : '-'}>
                              {formatDateDDMMMYYYY(invoice.invoiceDate)}
                            </td>
                            <td
                              style={{
                                width: '30%',
                                textAlign: 'left',
                                padding: '0.35rem 0.35rem',
                                color: 'var(--text-main)',
                                borderRight: isAdmin ? '1px solid var(--border)' : 'none',
                                whiteSpace: 'normal',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word',
                                minWidth: '260px',
                                maxWidth: '420px'
                              }}
                              title={String(invoice.transactionDescription || '')}
                            >
                              {invoice.transactionDescription || '-'}
                            </td>
                            <td style={{ width: '10%', textAlign: 'left', padding: '0.35rem 0.35rem', color: 'var(--text-main)', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }} title={`₹${invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                              ₹{invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ textAlign: 'left', padding: '0.35rem 0.35rem', borderRight: isAdmin ? '1px solid var(--border)' : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', position: 'relative' }}>
                                <MotionButton
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleDeleteInvoice(invoice._id);
                                  }}
                                  style={{
                                    padding: '0.25rem',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: 'var(--danger)',
                                    transition: 'all 0.2s'
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </MotionButton>
                                <MotionButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openDropdownId === invoice._id) {
                                      closeActionDropdown();
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                        rect,
                                        dropdownHeight: 280
                                      });
                                      setDropdownPosition({ top, left });
                                      setDropdownUp(shouldOpenUp);
                                      setDropdownInvoice(invoice);
                                      setOpenDropdownId(invoice._id);
                                      setAttachmentsMenuOpen(false);
                                    }
                                  }}
                                  style={{
                                    padding: '0.25rem',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                  }}
                                  title="Actions"
                                >
                                  <MoreVertical size={16} />
                                </MotionButton>

                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.5rem',
                  flexWrap: 'wrap'
                }}>
                  <MotionButton
                    onClick={() => fetchInvoices(currentPage - 1, searchQuery)}
                    disabled={currentPage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === 1 ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    Previous
                  </MotionButton>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <MotionButton
                      key={page}
                      onClick={() => fetchInvoices(page, searchQuery)}
                      disabled={page === currentPage}
                      style={{
                        padding: '0.5rem 1rem',
                        background: page === currentPage ? 'var(--primary)' : 'var(--bg-main)',
                        color: page === currentPage ? 'white' : 'var(--text-header)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: page === currentPage ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: page === currentPage ? 700 : 400
                      }}
                    >
                      {page}
                    </MotionButton>
                  ))}

                  <MotionButton
                    onClick={() => fetchInvoices(currentPage + 1, searchQuery)}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    Next
                  </MotionButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {infoOpen && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeInfo()
            }}
          >
            <div
              className="card"
              style={{
                width: 'min(700px, 96vw)',
                maxHeight: '88vh',
                overflow: 'auto',
                padding: '1.25rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-header)' }}>Invoice Details</div>
                  <div style={{ marginTop: 2, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {infoInvoice?.invoiceNumber ? `Invoice • ${infoInvoice.invoiceNumber}` : 'Invoice'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MotionButton
                    type="button"
                    onClick={refreshInfo}
                    disabled={infoLoading}
                    style={{
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      borderRadius: 10,
                      padding: '0.45rem',
                      cursor: infoLoading ? 'not-allowed' : 'pointer',
                      color: 'var(--text-muted)',
                      opacity: infoLoading ? 0.6 : 1
                    }}
                    title="Refresh"
                  >
                    <RotateCcw size={18} />
                  </MotionButton>
                  <MotionButton
                    type="button"
                    onClick={closeInfo}
                    style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, padding: '0.45rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                    title="Close"
                  >
                    <X size={18} />
                  </MotionButton>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                {/* Client Details */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.75rem' }}>Client Details</div>
                  <div style={{ background: 'var(--bg-main)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {(() => {
                        const client = infoInvoice?.vendorId;
                        const invoiceDate = infoInvoice?.invoiceDate ? new Date(infoInvoice.invoiceDate).toLocaleDateString() : '-';
                        const transactionDesc = infoInvoice?.transactionDescription || '-';

                        return (
                          <>
                            {client?.customerName && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Name</span>
                                <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.customerName}</span>
                              </div>
                            )}
                            {client?.vendorName && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Name</span>
                                <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.vendorName}</span>
                              </div>
                            )}
                            {client?.id && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Client ID</span>
                                <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.id}</span>
                              </div>
                            )}
                            {infoInvoice?.clientType && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Type</span>
                                <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem', textTransform: 'capitalize' }}>{infoInvoice.clientType}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Invoice Date</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{invoiceDate}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Description</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{transactionDesc}</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.75rem' }}>Items</div>
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-main)' }}>
                          <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Product</th>
                          <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const items = infoInvoice?.items || [];
                          if (items.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No items found</td>
                              </tr>
                            )
                          }
                          return (
                            <>
                              {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                  <td style={{ padding: '0.75rem', color: 'var(--text-main)', fontSize: '0.875rem' }}>{item.product || '-'}</td>
                                  <td style={{ padding: '0.75rem', color: 'var(--text-main)', fontSize: '0.875rem' }}>{item.description || '-'}</td>
                                  <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-main)', fontSize: '0.875rem', fontWeight: 700 }}>
                                    ₹{item.amount ? item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-main)' }}>
                                <td colSpan={2} style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 800, fontSize: '0.9rem' }}>Total</td>
                                <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--danger)', fontWeight: 900, fontSize: '0.95rem' }}>
                                  ₹{infoInvoice?.totalAmount ? infoInvoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                </td>
                              </tr>
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ActionMenuPortal>
      )}

      {/* Dropdown Menu */}
      {openDropdownId && dropdownInvoice && (
        <ActionMenuPortal>
          {(() => {
            const attachmentMenuItems = getAttachmentMenuItems(dropdownInvoice.attachments || []);

            return (
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 99999,
              minWidth: '220px',
              maxWidth: '260px',
              maxHeight: 'min(320px, 70vh)',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                setInfoInvoice(dropdownInvoice);
                setInfoOpen(true);
                closeActionDropdown();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-header)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Eye size={14} />
              View
            </MotionButton>
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                if (attachmentMenuItems.length > 0) {
                  setAttachmentsMenuOpen(prev => !prev);
                }
              }}
              disabled={attachmentMenuItems.length === 0}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: attachmentsMenuOpen ? 'var(--bg-main)' : 'transparent',
                border: 'none',
                cursor: attachmentMenuItems.length === 0 ? 'not-allowed' : 'pointer',
                color: attachmentMenuItems.length === 0 ? 'var(--text-muted)' : 'var(--text-header)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                transition: 'all 0.2s',
                opacity: attachmentMenuItems.length === 0 ? 0.7 : 1
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ImageIcon size={14} />
                View Attachments
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                {attachmentMenuItems.length}
              </span>
            </MotionButton>
            {attachmentsMenuOpen && attachmentMenuItems.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '0.35rem 0' }}>
                {attachmentMenuItems.map(({ attachment, label }, index) => (
                  <MotionButton
                    key={`${attachment.name || 'attachment'}-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openAttachmentPreview(attachment);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.45rem 0.75rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-header)',
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s'
                    }}
                    title={attachment.name || label}
                  >
                    {isImageAttachment(attachment) ? <ImageIcon size={13} /> : <FileText size={13} />}
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span>{label}</span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                        {attachment.name || 'Unnamed file'}
                      </span>
                    </span>
                  </MotionButton>
                ))}
              </div>
            )}
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                handleEditInvoice(dropdownInvoice);
                closeActionDropdown();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-header)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Edit2 size={14} />
              Edit
            </MotionButton>
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                generateInvoicePDF(dropdownInvoice);
                closeActionDropdown();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-header)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Eye size={14} />
              View PDF
            </MotionButton>
            <MotionButton
              onClick={async (e) => {
                e.stopPropagation();
                const deleted = await handleDeleteInvoice(dropdownInvoice._id);
                if (deleted) {
                  closeActionDropdown();
                }
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Trash2 size={14} />
              Delete
            </MotionButton>
          </div>
            )
          })()}
        </ActionMenuPortal>
      )}

      {attachmentViewerOpen && selectedAttachment && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.78)',
              zIndex: 100000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAttachmentPreview()
            }}
          >
            <div
              style={{
                width: isPdfAttachment(selectedAttachment) ? 'min(1000px, 94vw)' : 'auto',
                maxWidth: '94vw',
                maxHeight: '92vh',
                background: '#fff',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 20px 45px rgba(0,0,0,0.28)',
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '0.9rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  background: '#f8fafc'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedAttachment.name || 'Attachment Preview'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    {isImageAttachment(selectedAttachment) ? 'Image preview' : isPdfAttachment(selectedAttachment) ? 'PDF preview' : 'Attachment preview'}
                  </div>
                </div>
                <MotionButton
                  type="button"
                  onClick={closeAttachmentPreview}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    borderRadius: 10,
                    padding: '0.45rem',
                    cursor: 'pointer',
                    color: '#475569'
                  }}
                  title="Close"
                >
                  <X size={18} />
                </MotionButton>
              </div>

              <div
                style={{
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#e2e8f0',
                  overflow: 'auto',
                  maxHeight: 'calc(92vh - 72px)'
                }}
              >
                {isImageAttachment(selectedAttachment) ? (
                  <img
                    src={selectedAttachment.dataUrl}
                    alt={selectedAttachment.name || 'Attachment preview'}
                    style={{
                      display: 'block',
                      maxWidth: 'min(90vw, 1100px)',
                      maxHeight: 'calc(92vh - 120px)',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: '12px',
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)'
                    }}
                  />
                ) : isPdfAttachment(selectedAttachment) ? (
                  <iframe
                    src={selectedAttachment.dataUrl}
                    title={selectedAttachment.name || 'PDF preview'}
                    style={{
                      width: 'min(90vw, 980px)',
                      height: 'min(78vh, 900px)',
                      border: 'none',
                      borderRadius: '12px',
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)'
                    }}
                  />
                ) : (
                  <div style={{ padding: '2rem', color: '#475569', fontWeight: 600, background: '#fff', borderRadius: '12px' }}>
                    Preview is not available for this attachment type.
                  </div>
                )}
              </div>
            </div>
          </div>
        </ActionMenuPortal>
      )}

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && pdfBlobUrl && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 100000,
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={() => setPdfViewerOpen(false)}
          >
            {/* Header */}
            <div
              style={{
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: 0, color: '#1e293b' }}>{pdfFileName}</h3>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <MotionButton
                  onClick={handleDownloadPdf}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Download
                </MotionButton>
                <MotionButton
                  onClick={() => setPdfViewerOpen(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#e5e7eb',
                    color: '#1e293b',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </MotionButton>
              </div>
            </div>

            {/* PDF Content */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1.5rem',
                overflow: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <iframe
                src={pdfBlobUrl}
                style={{
                  width: '100%',
                  maxWidth: '900px',
                  height: '100%',
                  minHeight: '600px',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.25)'
                }}
                title="PDF Viewer"
              />
            </div>
          </div>
        </ActionMenuPortal>
      )}

    </div>
  );
}

export default Invoice;
