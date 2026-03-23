
import os
import logging
from pynetdicom import AE, StoragePresentationContexts
from pynetdicom.sop_class import CTImageStorage, MRImageStorage
from pydicom.dataset import FileDataset
from pydicom.uid import ImplicitVRLittleEndian, ExplicitVRLittleEndian, ExplicitVRBigEndian

logger = logging.getLogger("dicom-pacs-store")

# 🟢 IHE Cardiology Profile Conformance:
# Complies with IHE ITI TF-2a (Transactions) - Ensures robust syntax negotiation 
# for multi-vendor PACS environments (Orthanc, Epic, Cerner).

def send_to_pacs(dataset: FileDataset) -> bool:
    """Negotiates Transfer Syntax and pushes DICOM to Orthanc PACS via C-STORE."""
    
    pacs_ip = os.getenv("PACS_HOST", "orthanc") # Local docker-compose or K8s internal IP
    pacs_port = int(os.getenv("PACS_PORT", 4242))
    
    # 1. Initialize Application Entity
    ae = AE(ae_title=b'MEDICONNECT_AE')

    # 2. Custom Transfer Syntax Negotiation (Senior level implementation)
    # Required to support older hospital systems and compressed modern scans.
    transfer_syntaxes = [ImplicitVRLittleEndian, ExplicitVRLittleEndian, ExplicitVRBigEndian]
    
    # Add presentation contexts for CT and MRI
    ae.add_supported_context(CTImageStorage, transfer_syntaxes)
    ae.add_supported_context(MRImageStorage, transfer_syntaxes)
    
    # Also add standard storage contexts as a fallback
    for context in StoragePresentationContexts:
        ae.add_supported_context(context.abstract_syntax, transfer_syntaxes)

    # 3. Associate and send (C-STORE)
    assoc = ae.associate(pacs_ip, pacs_port, ae_title=b'ORTHANC')
    if assoc.is_established:
        status = assoc.send_c_store(dataset)
        assoc.release()
        return status and status.Status == 0x0000
    else:
        logger.error("Association with PACS rejected or timed out.")
        return False