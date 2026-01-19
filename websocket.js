import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'

import jsonwebtoken from 'jsonwebtoken'
import bodyParser from 'body-parser'

import dotenv from 'dotenv'
import { length, z } from 'zod'

dotenv.config()
const app = express()
const router = express.Router()

router.post('/signup', verify)

const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(express.json())
// app.use(verifyToken)
app.use(bodyParser.json());

const activeSession = {
    classId: "c101", // current active class
    startedAt: "2025-03-11T10:00:00.000Z", // ISO string
    attendance: {
        "s100": "present",
        "s101": "absent"
        // studentId: status
    }
};


//wss is the main socket which listens for 
// any new client connection requests
wss.on('connection', (newSocketInstance) => { // This "newSocketInstance" is the new instance for a new client
    console.log("msg")

    newSocketInstance.on('message', (data, isBinary) => {
        newSocketInstance.send("returning the input " + data);
        console.log("OPEN")
    })
})

server.listen(3000, () => {
    console.log("Hello there!")
})

app.get('/gett', (req, res) => {
    console.log("Hey")
    res.send("gettt")
})

function verifyToken(token) {
    try {
        const user = jsonwebtoken.verify(token, process.env.JWT_ACCESS_TOKEN_PRIVATE_KEY)
    } catch (error) {
        console.error(error)
        return
    }
}

function generateAccessToken(data) {
    return jsonwebtoken.sign(data, process.env.JWT_REFRESH_TOKEN_PRIVATE_KEY)
}

function generateRefreshToken(data) {
    return jsonwebtoken.sign(data, process.env.JWT_REFRESH_TOKEN_PRIVATE_KEY)
}

app.post('/login', (req, res) => {
    try {
        const token = req.headers.authorization
        const { username, password } = req.body

        if (username !== null || password !== null) {
            generateAccessToken({});
            generateRefreshToken();
        }
        console.log(user)
    } catch (error) {
        console.error(error)
        res.status(500).send()
    }
})

app.post('/signup', (req, res) => {

    let signUpData;
    try {
        signUpData = SignupSchema.parse(req.body)
        const token = jsonwebtoken.sign(req.body, process.env.JWT_ACCESS_TOKEN_PRIVATE_KEY)
        console.log(token)
        res.json({
            "token": token
        }).send()

    } catch (error) {
        console.error(error)
        res.status(500).send(signUpData[0].message)
    }
})


const RoleEnum = z.enum(["teacher", "student"])
const SignupSchema = z.object({
    name: z.string(),
    email: z.email(),
    password: z.string().min(6),
    role: RoleEnum
})