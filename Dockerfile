FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Remove existing node_modules and package-lock.json
RUN rm -rf node_modules package-lock.json

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# Expose port 3000
EXPOSE 3000

# Command to run the application
#CMD ["node", "index.js"]
