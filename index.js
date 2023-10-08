const express = require('express')
const fs = require('fs')
const path = require('path');

const config = require('./config.json')
const Default = require('./default.js')
const defaultPath = { ...Default.Path, folder: config.defaultFolder }

const app = express()

// app.get('/', function (req, res) {

// })

// app.get('/admin', function (req, res) {

// })

app.all('*', function (req, res) {

    console.log(`${req.method} ${req.hostname}${req.originalUrl}`)

    currentPath = decodeURI(req.originalUrl.split("?")[0])

    var folderConfig = getFolderConfig(currentPath, config.defaultFolder, req.hostname, currentPath)
    var formatedOriginalUrl = folderConfig.URL


    var allowedHostname = false

    if (folderConfig.config.allowedHostname.length > 0) {
        folderConfig.config.allowedHostname.forEach(hostname => {
            if (hostname == '*' || req.hostname == hostname) {
                allowedHostname = true
            }
        });
    } else {
        allowedHostname = true
    }

    var sendFile = false
    if (allowedHostname) {


        var folder = config.defaultFolder
        if (folderConfig.config.folder) {
            folder = folderConfig.config.folder
        }
        if (folderConfig.config.protection) {
            //todo
        } else {
            sendFile = true
        }
    }

    if (sendFile) {
        var filePath = path.join(path.join(__dirname, folder), folderConfig.path)

        var pathIsFolder = false
        if (formatedOriginalUrl.endsWith('/')) {
            pathIsFolder = true
            if (fs.existsSync(filePath + "/index.ejs")) {
                var fileStat = fs.statSync(filePath + "/index.ejs")
                if (fileStat && !fileStat.isDirectory()) {
                    filePath = filePath + "/index.ejs"
                    pathIsFolder = false
                }
            } else
                if (fs.existsSync(filePath + "/index.html")) {
                    var fileStat = fs.statSync(filePath + "/index.html")
                    if (fileStat && !fileStat.isDirectory()) {
                        filePath = filePath + "/index.html"
                        pathIsFolder = false
                    }
                }
            if (!fs.existsSync(filePath)) {
                pathIsFolder = false
            }
        }

        folderConfig.config.headers.forEach(header => {
            res.append(header.key, header.value)
        });

        if (pathIsFolder) {
            if (folderConfig.config.onlineFolder) {
                var childs = fs.readdirSync(filePath, { withFileTypes: true }).sort(function (a, b) {
                    if (a.isDirectory() && !b.isDirectory()) {
                        return -1
                    } else if (!a.isDirectory() && b.isDirectory()) {
                        return 1
                    } else {
                        return 0
                    }
                })
                var formatedChilds = []
                childs.forEach(child => {
                    if (!child.name.endsWith(".fsconfig") || !doesMatchFromList(folderConfig.config.DisallowedFiles, child.name)) {
                        var fullChildPath = path.join(filePath, child.name)
                        if (child.isDirectory()) {
                            child.size = getFolderSize(fullChildPath)
                        } else {
                            var childStat = fs.statSync(fullChildPath)
                            child.size = childStat.size
                        }
                        child.sizeText = getBytesText(child.size)
                        formatedChilds.push(child)
                    }



                });
                res.render('onlineFolder.ejs', { req, res, childs: formatedChilds })
            } else {
                sendFile = false
            }
        } else {

            var fileStat = null
            if (fs.existsSync(filePath)) {
                fileStat = fs.statSync(filePath)
            }

            if ((!fileStat || fileStat.isDirectory()) && fs.existsSync(filePath + '.ejs')) {
                filePath = filePath + '.ejs'
                if (fs.existsSync(filePath)) {
                    fileStat = fs.statSync(filePath)
                }
            }

            if (fileStat && !fileStat.isDirectory()) {
                if (doesMatchFromList(folderConfig.config.DisallowedFiles, filePath)) {
                    sendFile = false
                } else if (filePath.endsWith('.fsconfig')) {
                    sendFile = false
                } else if (filePath.endsWith('.ejs')) {
                    res.render(filePath, { req, res })
                } else {
                    res.sendFile(filePath)
                }

            } else {
                sendFile = false
            }
        }



    }
    if (!sendFile) {
        {
            res.render('errors/404.ejs', { req, res })
        }
    }
})

function getFolderSize(folder) {
    var result = 0
    fs.readdirSync(folder, { withFileTypes: true }).forEach(element => {
        if (element.isDirectory()) {
            result = getFolderSize(path.join(folder, element.name))
        } else {
            result = result + fs.statSync(path.join(folder, element.name)).size
        }
    });
    return result
}

const getBytesText = function (bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"]

    if (bytes == 0) {
        return "n/a"
    }

    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))

    if (i == 0) {
        return bytes + " " + sizes[i]
    }

    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i]
}

const getFolderConfig = function (path, workingPath, domain = '127.0.0.1', URL = '/', currentConfig = { ...defaultPath }, relativePath = null) {
    if (!relativePath) {
        relativePath = path
    }
    var result = currentConfig
    var workingPath = workingPath.replace('\\', '/')
    path = path.replace('\\', '/')
    var leftPath = path

    if (path.endsWith('/')) {
        path = path.slice(0, -1)
    } else {
    }
    path.split('/').forEach(pathPart => {
        leftPath = leftPath.replace(pathPart + '/', '')
        workingPath = workingPath + pathPart

        var currentFsConfig = getFsConfig(workingPath + '.fsconfig')
        if (currentFsConfig) {
        } else if (!workingPath.endsWith('/')) {
            workingPath = workingPath + '/'
            currentFsConfig = getFsConfig(workingPath + '.fsconfig')
        }
        if (currentFsConfig) {
            result = { ...result, ...currentFsConfig }
            if (currentFsConfig.pathRewrite && currentFsConfig.pathRewrite[domain]) {
                leftPath = currentFsConfig.pathRewrite[domain] + leftPath
                URL = currentFsConfig.pathRewrite[domain] + URL
                relativePath = leftPath
                delete result.pathRewrite
            }
            if (currentFsConfig.folder) {
                workingPath = currentFsConfig.folder
                relativePath = leftPath
            }
            if ((currentFsConfig.pathRewrite && currentFsConfig.pathRewrite[domain]) || currentFsConfig.folder) {
                return getFolderConfig(leftPath, workingPath, domain, URL, result, relativePath)
            }
        }
    });
    return { config: result, URL, path: relativePath }
}

const getFsConfig = function (path) {
    if (fs.existsSync(path)) {
        return JSON.parse(fs.readFileSync(path))
    } else {
        return null
    }
}

const matchRuleShort = function (str, rule) { //from https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript
    var escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str);
}

const doesMatchFromList = function (list, str) {
    result = false
    list.forEach(rule => {
        if (matchRuleShort(str, rule)) {
            result = true
            return result
        }
    });
    return result
}

app.listen(config.port);