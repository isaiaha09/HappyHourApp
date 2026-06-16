import { dedupeImageUrls } from '../placeHelpers';

describe('dedupeImageUrls', () => {
  it('removes exact duplicate URLs', () => {
    expect(dedupeImageUrls([
      'https://images.example.com/patio.jpg',
      'https://images.example.com/patio.jpg',
      'https://images.example.com/front.jpg',
    ])).toEqual([
      'https://images.example.com/patio.jpg',
      'https://images.example.com/front.jpg',
    ]);
  });

  it('dedupes Cloudflare resized variants of the same asset', () => {
    expect(dedupeImageUrls([
      'https://popmenucloud.com/cdn-cgi/image/width=1200,height=630,format=auto,fit=cover/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://popmenucloud.com/cdn-cgi/image/width%3D1920%2Cheight%3D1920%2Cfit%3Dscale-down%2Cformat%3Dauto%2Cquality%3D20/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://images.example.com/front.jpg',
    ])).toEqual([
      'https://popmenucloud.com/cdn-cgi/image/width=1200,height=630,format=auto,fit=cover/tnwlafer/4e89a795-8a8b-48a0-881b-6cd0415f2bb7',
      'https://images.example.com/front.jpg',
    ]);
  });

  it('dedupes query-based resize variants of the same file', () => {
    expect(dedupeImageUrls([
      'https://static1.squarespace.com/static/photo.png?format=1500w',
      'https://static1.squarespace.com/static/photo.png?format=2500w',
      'https://static1.squarespace.com/static/other-photo.png?format=1500w',
    ])).toEqual([
      'https://static1.squarespace.com/static/photo.png?format=1500w',
      'https://static1.squarespace.com/static/other-photo.png?format=1500w',
    ]);
  });

  it('dedupes path-based CDN size variants', () => {
    expect(dedupeImageUrls([
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/500x500',
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/100x67',
      'https://dynl.mktgcdn.com/p/another-asset/500x500',
    ])).toEqual([
      'https://dynl.mktgcdn.com/p/SRFYEpCKcfTxj96Y-SCWNfTfDZoRu505ffHDrwtf86Y/500x500',
      'https://dynl.mktgcdn.com/p/another-asset/500x500',
    ]);
  });
});