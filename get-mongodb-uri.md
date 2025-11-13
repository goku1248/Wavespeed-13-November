# How to Get Your Correct MongoDB URI

## Option 1: Get it from MongoDB Atlas (Easiest)

1. **Go to MongoDB Atlas**: https://cloud.mongodb.com/
2. **Sign in** to your account
3. **Click "Connect"** on your cluster
4. **Choose "Connect your application"**
5. **Copy the connection string** - it will look like:
   ```
   mongodb+srv://<username>:<password>@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
   ```
6. **Replace `<username>`** with your actual username (probably `gokulvshetty`)
7. **Replace `<password>`** with your actual password

## Option 2: Construct it Manually

If you know your username and password:

**Format:**
```
mongodb+srv://USERNAME:PASSWORD@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
```

**Important:** If your password contains special characters, you need to URL-encode them:

| Character | Encoded |
|-----------|---------|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `?` | `%3F` |
| `#` | `%23` |
| `[` | `%5B` |
| `]` | `%5D` |
| ` ` (space) | `%20` or `+` |
| `%` | `%25` |

## Option 3: Use URL Encoding Tool

1. Go to: https://www.urlencoder.org/
2. Paste your password
3. Click "Encode"
4. Copy the encoded password
5. Use it in the connection string

## Example

If your password is `My@Pass#123`, it should be:
```
mongodb+srv://gokulvshetty:My%40Pass%23123@cluster1.bckup3t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1
```

## What's Your Password?

Please provide:
1. Your MongoDB Atlas username (if different from `gokulvshetty`)
2. Your MongoDB Atlas password (I can help encode it if needed)

Or you can:
- Go to MongoDB Atlas → Connect → Get connection string
- Copy the complete URI they provide
- That will have everything correct!

