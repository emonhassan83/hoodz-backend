export type TFileCategory = {
  folder: 'images' | 'videos' | 'audios' | 'documents' | 'archives' | 'others';
  type:
    | 'image'
    | 'video'
    | 'document_pdf'
    | 'document_office'
    | 'document_text'
    | 'audio'
    | 'archive'
    | 'unknown';
};
