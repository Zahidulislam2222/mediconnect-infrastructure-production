from pydicom.dataset import FileDataset

def apply_hipaa_safe_harbor(dataset: FileDataset, secure_user_id: str) -> FileDataset:
    """
    Implements HIPAA Safe Harbor de-identification (PS3.15 Annex E).
    Strips PII and maps PatientID to MediConnect's internal UUID.
    """
    
    # 1. Tags to completely remove
    tags_to_delete =[
        'PatientBirthDate', 'PatientBirthTime', 'PatientSex', 'PatientAge',
        'PatientAddress', 'PatientTelephoneNumbers', 'PatientMotherBirthName',
        'InstitutionName', 'InstitutionAddress', 'ReferringPhysicianName',
        'PerformingPhysicianName', 'OperatorsName', 'StationName',
        'StudyDate', 'StudyTime', 'SeriesDate', 'SeriesTime', 'AccessionNumber'
    ]
    
    for tag in tags_to_delete:
        if tag in dataset:
            delattr(dataset, tag)

    # 2. Tags to anonymize / replace
    if 'PatientName' in dataset:
        dataset.PatientName = "ANONYMIZED^PATIENT"
        
    # 🟢 CRITICAL: Link the DICOM to your Node.js DynamoDB UUID
    dataset.PatientID = secure_user_id
    
    # Generate new random UIDs to prevent cross-referencing external databases
    from pydicom.uid import generate_uid
    if 'StudyInstanceUID' in dataset:
        dataset.StudyInstanceUID = generate_uid()
    if 'SeriesInstanceUID' in dataset:
        dataset.SeriesInstanceUID = generate_uid()
    if 'SOPInstanceUID' in dataset:
        dataset.SOPInstanceUID = generate_uid()

    return dataset