CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME,
  status ENUM('active','unsubscribed') DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  post_id INT,
  FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE SET NULL
); 