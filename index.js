const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ObjectId, MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.actwx8z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //collection
    const db = client.db("Real_State_db");
    const usersCollection = db.collection("users");
    const propertiesCollection = db.collection("properties");

    // custom middlewares

    // verify firebase token
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      //verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // post user info
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // find user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const user = await usersCollection.findOne(
          { email },
          { projection: { role: 1 } } // Only fetch the role field
        );

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" }); // Default to "user" if no role
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // added user media links
    app.patch("/users", async (req, res) => {
      try {
        const { applicant, facebook, twitter, whatsapp } = req.body;

        if (!applicant) {
          return res.status(400).json({ error: "Applicant email is required" });
        }

        const result = await usersCollection.updateOne(
          { email: applicant },
          {
            $set: { facebook, twitter, whatsapp },
          }
        );

        console.log("Update result:", result);
        res.json(result);
      } catch (error) {
        console.error("PATCH /users error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // GET /users/socials?email=user@example.com
    app.get("/users/socials", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const user = await usersCollection.findOne(
          { email },
          {
            projection: {
              _id: 0,
              facebook: 1,
              twitter: 1,
              whatsapp: 1,
            },
          }
        );

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json(user); // returns { facebook, twitter, whatsapp }
      } catch (error) {
        console.error("GET /users/socials error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // POST /addProperties
    app.post("/addProperties", async (req, res) => {
      try {
        const property = req.body;

        // Optional: Validate required fields
        if (
          !property.title ||
          !property.location ||
          !property.image ||
          !property.agentName ||
          !property.agentEmail ||
          !property.priceRange
        ) {
          return res
            .status(400)
            .json({ error: "All required fields must be provided." });
        }

        property.status = "available";
        property.createdAt = new Date();

        const result = await propertiesCollection.insertOne(property);
        res.status(201).json({
          message: "Property added successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to add property:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // get all pending properties on admin manage properties
    app.get("/manage-properties", async (req, res) => {
      try {
        const result = await propertiesCollection
          .find({ status: "available" }) // 'available' means not yet verified or rejected
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch properties" });
      }
    });

    // verify a property from admin manage property
    app.patch("/properties/verify/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "verified" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to verify property" });
      }
    });

    // reject a property from admin manage property
    app.patch("/properties/reject/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to reject property" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Simple root route
app.get("/", (req, res) => {
  res.send("BrickBase Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
